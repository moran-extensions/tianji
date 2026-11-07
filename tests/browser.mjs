import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, '.artifacts'); await mkdir(artifacts, { recursive: true });
const puppeteer = (await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
const profile = await mkdtemp(path.join(os.tmpdir(), 'cj3-browser-'));
const testRoot = await mkdtemp(path.join(os.tmpdir(), 'cj3-extension-'));
await cp(path.join(root, 'extension'), testRoot, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(testRoot, 'manifest.json'), 'utf8'));
// The disposable test extension has a pre-granted fake host. Production has only optional permissions.
manifest.host_permissions = ['http://forms.example.test/*'];
await writeFile(path.join(testRoot, 'manifest.json'), JSON.stringify(manifest));
const id = (await readFile(path.join(root, 'dist/extension-id.txt'), 'utf8')).trim();
const origin = `chrome-extension://${id}`, site = 'http://forms.example.test';
const fixture = await readFile(path.join(root, 'tests/fixtures/form.html'), 'utf8');
const results = [], errors = []; let browser, manager, page, client;
const record = value => { results.push(value); console.log('PASS ' + value); };
const send = (type, extra = {}) => manager.evaluate(async message => { const result = await chrome.runtime.sendMessage(message); if (!result.ok) throw new Error(result.error); return result.data; }, { type, ...extra });
async function launch() {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE || undefined, headless: true, protocolTimeout: 25000, userDataDir: profile, args: [`--disable-extensions-except=${testRoot}`, `--load-extension=${testRoot}`, '--no-first-run', '--disable-default-apps', '--disable-background-networking', '--no-proxy-server'] });
  await browser.waitForTarget(target => target.type() === 'service_worker' && target.url() === `${origin}/background.js`, { timeout: 15000 });
  manager = await browser.newPage(); manager.on('pageerror', error => errors.push(error.message)); await manager.goto(`${origin}/manager.html`);
  page = await browser.newPage(); await page.setViewport({ width: 1120, height: 900 }); page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    // In-memory fictional form pages: no real server, credentials or submitted data.
    if (request.url().startsWith(site)) void request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
    else void request.abort();
  });
  client = await page.createCDPSession(); await page.goto(site + '/job/example-a/build?delay=0sec');
}
async function shadowNode(selector, optional = false) {
  const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  function find(node) { const attrs = node.attributes || []; if (attrs.some((value, i) => i % 2 === 0 && value === 'id' && attrs[i + 1] === 'chajian3-field-history')) return node; for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const found = find(child); if (found) return found; } return null; }
  const host = find(root), shadow = host?.shadowRoots?.[0];
  if (!shadow) { if (optional) return null; throw new Error('No active field helper'); }
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: shadow.nodeId, selector });
  if (!nodeId && !optional) throw new Error('Missing shadow selector: ' + selector);
  return nodeId || null;
}
async function shadowValue(selector, fn = 'function(){return this.textContent}') {
  const nodeId = await shadowNode(selector); const { object } = await client.send('DOM.resolveNode', { nodeId });
  const result = await client.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn, returnByValue: true });
  return result.result.value;
}
async function shadowClick(selector) {
  const nodeId = await shadowNode(selector); const { model } = await client.send('DOM.getBoxModel', { nodeId });
  const q = model.content; await page.mouse.click((q[0] + q[2] + q[4] + q[6]) / 4, (q[1] + q[3] + q[5] + q[7]) / 4);
}
async function waitFor(fn, label) {
  for (let n = 0; n < 100; n++) { try { if (await fn()) return; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Timed out: ' + label);
}
const getFields = async () => (await send('MANAGER_GET')).fields;
const getRow = async key => (await getFields()).find(row => row.key === key && row.path === '/job/example-a');
async function type(selector, value) { await page.click(selector); await page.$eval(selector, node => { node.value = ''; }); await page.keyboard.type(value); }
async function open(selector = '#sampleText') {
  await page.click(selector); await waitFor(async () => await shadowNode('#trigger', true) && !await shadowValue('#trigger', 'function(){return this.hidden}'), 'visible helper button'); await shadowClick('#trigger');
  await waitFor(async () => !await shadowValue('#panel', 'function(){return this.hidden}') && !String(await shadowValue('#list')).includes('正在读取'), 'history panel');
}
async function popup() {
  const tabs = await manager.evaluate(url => chrome.tabs.query({ url }), site + '/*'); const targetId = tabs.find(tab => tab.url.includes('/job/example-a/')).id;
  const pop = await browser.newPage(); pop.on('pageerror', error => errors.push(error.message));
  // A popup opened as a test tab has a different active-tab relationship than a toolbar popup.
  await pop.evaluateOnNewDocument(tabId => { const query = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = async options => options.active ? [await chrome.tabs.get(tabId)] : query(options); }, targetId);
  await pop.setViewport({ width: 360, height: 620 }); await pop.goto(`${origin}/popup.html`); await pop.waitForFunction(() => !document.getElementById('toggle').disabled);
  return pop;
}
try {
  await launch();
  await type('#sampleText', 'not-enabled'); await page.click('#reference'); assert.equal((await getFields()).length, 0);
  record('nothing is recorded before the site is explicitly enabled');
  const pop = await popup(); await pop.click('#toggle'); await pop.waitForFunction(() => document.getElementById('toggle').textContent.includes('暂停'));
  await pop.screenshot({ path: path.join(artifacts, 'popup.png'), fullPage: true }); await pop.close(); await page.bringToFront();
  for (const value of ['SAMPLE-001', '0007-SAMPLE', 'SAMPLE-002']) { await type('#sampleText', value); await page.click('#reference'); }
  await type('#reference', 'example-0091'); await page.click('#sampleText');
  await waitFor(async () => (await getRow('parameter:CONTENT'))?.items.length === 3 && (await getRow('parameter:REFERENCE'))?.items.length === 1, 'separate field histories');
  assert.equal(await page.evaluate(() => document.getElementById('chajian3-field-history').shadowRoot), null);
  record('fields sharing name=value keep separate histories; leading zeroes are preserved');
  await page.$eval('#sampleText', node => { node.value = ''; });
  await open(); const list = await shadowValue('#list'); assert.ok(list.includes('0007-SAMPLE')); assert.ok(!list.includes('example-0091'));
  await page.screenshot({ path: path.join(artifacts, 'history-panel.png'), fullPage: true });
  await shadowClick('#search'); await page.keyboard.type('0007');
  await waitFor(async () => (await shadowValue('#list')).includes('0007') && !(await shadowValue('#list')).includes('SAMPLE-002'), 'history search');
  await page.keyboard.press('Enter'); await waitFor(async () => await page.$eval('#sampleText', node => node.value === '0007-SAMPLE'), 'history fill');
  assert.equal(await page.evaluate(() => submissions), 0);
  const inputEvents = await page.evaluate(() => events.slice(-2)); assert.deepEqual(inputEvents.map(e => e.type), ['input','change']);
  record('click/search/Enter fills the selected input and notifies the page without submitting the form');
  await page.click('#reference'); assert.equal((await getRow('parameter:CONTENT')).items.length, 3);
  await page.evaluate(() => { const node = document.getElementById('sampleText'); node.value = 'script-value-not-recorded'; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); });
  await type('#secret-token', 'dummy-secret-token'); await type('#password', 'dummy-password'); await page.click('#sampleText');
  const dbText = JSON.stringify(await send('MANAGER_GET')); assert.ok(!dbText.includes('dummy-secret')); assert.ok(!dbText.includes('dummy-password')); assert.ok(!dbText.includes('script-value-not-recorded'));
  await page.click('#readonly'); assert.equal(await shadowNode('#trigger', true), null);
  record('script-generated changes, password, token and read-only fields are not recorded');
  await page.click('#sampleText'); await waitFor(async () => await shadowNode('#trigger', true), 'trigger restored');
  await shadowValue('#trigger', 'function(){this.click();return true}'); assert.equal(await shadowValue('#panel', 'function(){return this.hidden}'), true);
  record('page-generated synthetic clicks cannot open or choose stored history');
  await page.click('#add'); await type('#dynamic', 'dynamic-value-12'); await page.click('#sampleText');
  await waitFor(async () => (await getFields()).some(row => row.label === '动态内容'), 'dynamic field capture');
  await open(); const before = (await getRow('parameter:CONTENT')).items.length; await shadowClick('#list .delete');
  await waitFor(async () => (await getRow('parameter:CONTENT')).items.length === before - 1, 'delete history'); await page.keyboard.press('Escape');
  record('dynamically added inputs are supported and individual history entries can be removed');
  await page.goto(site + '/job/example-b/build'); await open(); assert.ok(String(await shadowValue('#list')).includes('还没有记录'));
  await page.goto('http://forms.example.test:8081/job/example-a/build'); await page.click('#sampleText');
  assert.equal(await page.$('#chajian3-field-history'), null);
  record('another page group and another port do not inherit history or enabled state');
  await page.goto(site + '/job/example-a/build'); await open();
  assert.equal((await shadowValue('#list')).includes('example-0091'), false); await page.keyboard.press('Escape');
  const tabs = await manager.evaluate(url => chrome.tabs.query({ url }), site + '/*');
  const testTab = tabs.find(tab => tab.url.includes('/job/example-a/build') && !tab.url.includes(':8081'));
  const storage = await manager.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, func: async () => new Promise(resolve => {
    const request = indexedDB.open('cj3-input-history');
    request.onerror = () => resolve('denied');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) { db.close(); resolve('denied'); return; }
      const read = db.transaction('records').objectStore('records').get('state');
      read.onsuccess = () => { db.close(); resolve(read.result ? 'allowed' : 'denied'); };
    };
  }) }), testTab.id);
  assert.equal(storage[0].result, 'denied');
  record('content scripts cannot directly read the complete history database');
  const pause = await popup(); await pause.click('#toggle'); await pause.waitForFunction(() => document.getElementById('toggle').textContent.includes('启用'));
  await pause.close(); await page.bringToFront(); const retained = (await send('MANAGER_GET')).values;
  await type('#sampleText', 'paused-not-recorded'); await page.click('#reference'); assert.equal((await send('MANAGER_GET')).values, retained);
  await send('SITE_SET', { origin: site, enabled: true, tabId: testTab.id });
  await browser.close(); browser = null; await launch(); await open();
  assert.ok(String(await shadowValue('#list')).includes('SAMPLE-'));
  record('pausing stops recording without deleting data; browser restart restores enabled-site history');
  await manager.bringToFront(); await manager.reload(); await manager.waitForSelector('.field-card');
  await manager.setViewport({ width: 1080, height: 850 }); await manager.click('.field-card summary');
  await manager.screenshot({ path: path.join(artifacts, 'manager.png'), fullPage: true });
  await manager.setViewport({ width: 375, height: 800 }); assert.equal(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await manager.screenshot({ path: path.join(artifacts, 'manager-narrow.png'), fullPage: true });
  await manager.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await manager.screenshot({ path: path.join(artifacts, 'manager-dark.png'), fullPage: true });
  assert.deepEqual(errors, []); record('manager, narrow layout and dark/reduced-motion modes render without errors');
  await writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify({ passed: results, mode: 'Real Chrome, optional-host flow with a pre-granted fictional test host, isolated in-memory form pages', realUserWebsiteTested: false }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
  if (manager && !manager.isClosed()) console.error('Manager message:', await manager.$eval('#message', node => node.textContent).catch(() => 'unavailable'));
  console.error('Browser errors:', errors); throw error;
} finally {
  if (browser) await browser.close(); await rm(profile, { recursive: true, force: true }); await rm(testRoot, { recursive: true, force: true });
}
