import { siteOrigin, hostPattern, pageScope, validateField, fieldId } from './lib/rules.js';
import { emptyData, saveValue, stats } from './lib/history.js';
import { readData, writeData } from './lib/store.js';
let writes = Promise.resolve();
let registrations = Promise.resolve();
const liveTabs = new Map();
async function read() {
  const value = await readData();
  if (value === undefined) return emptyData();
  if (value?.version !== 1 || !value.sites || !value.fields) throw new Error('本机记录格式不受支持');
  return value;
}
function change(fn) {
  const task = writes.then(async () => { const db = await read(); const result = await fn(db); await writeData(db); return result; });
  writes = task.catch(() => {}); return task;
}
async function snapshot() { await writes; return read(); }
// Extension tabs have sender.tab. Their URL still establishes the extension origin.
const trusted = sender => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
async function context(sender, db) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || sender.tab.incognito) throw new Error('不支持此页面');
  const origin = siteOrigin(sender.url);
  if (!db.sites[origin]?.enabled || !await chrome.permissions.contains({ origins: [hostPattern(origin)] })) throw new Error('此站点尚未启用记录');
  if (!liveTabs.has(origin)) liveTabs.set(origin, new Set());
  liveTabs.get(origin).add(sender.tab.id);
  return { origin, path: pageScope(sender.url) };
}
async function scriptId(pattern) { return 'cj3-' + (await fieldId(pattern, '', '')).slice(0, 24); }
async function reconcileOnce() {
  const db = await snapshot(), patterns = new Set();
  for (const [origin, site] of Object.entries(db.sites)) if (site.enabled && await chrome.permissions.contains({ origins: [hostPattern(origin)] })) patterns.add(hostPattern(origin));
  const wanted = new Map();
  for (const pattern of patterns) wanted.set(await scriptId(pattern), pattern);
  const current = await chrome.scripting.getRegisteredContentScripts();
  const remove = current.filter(item => item.id.startsWith('cj3-') && !wanted.has(item.id)).map(item => item.id);
  if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove });
  const add = [...wanted].filter(([id]) => !current.some(item => item.id === id)).map(([id, pattern]) => ({ id, matches: [pattern], js: ['content.js'], allFrames: false, runAt: 'document_idle', persistAcrossSessions: true }));
  if (add.length) await chrome.scripting.registerContentScripts(add);
}
function reconcile() {
  const task = registrations.then(reconcileOnce); registrations = task.catch(() => {}); return task;
}
async function notify(origin, inject = false) {
  const tabs = await chrome.tabs.query({ url: hostPattern(origin) }).catch(() => []);
  const ids = new Set(liveTabs.get(origin) || []);
  for (const tab of tabs) try { if (siteOrigin(tab.url) === origin) ids.add(tab.id); } catch {}
  await Promise.allSettled([...ids].map(async id => {
    try { await chrome.tabs.sendMessage(id, { type: 'CJ3_REFRESH' }); }
    catch { if (inject) await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] }); }
  }));
}
async function handle(message, sender) {
  if (message.type === 'CONTEXT') {
    const db = await snapshot();
    try { const ctx = await context(sender, db); return { enabled: true, ...ctx }; }
    catch { return { enabled: false }; }
  }
  if (['FIELD_GET', 'FIELD_SAVE', 'FIELD_USE', 'FIELD_DELETE'].includes(message.type)) {
    const field = validateField(message.field);
    if (message.type === 'FIELD_GET') {
      const db = await snapshot(), ctx = await context(sender, db), id = await fieldId(ctx.origin, ctx.path, field.key);
      return { field: field.label, items: db.fields[id]?.items || [] };
    }
    let origin;
    const result = await change(async db => {
      const ctx = await context(sender, db); origin = ctx.origin;
      const id = await fieldId(ctx.origin, ctx.path, field.key);
      if (message.type === 'FIELD_SAVE') { saveValue(db, id, ctx, field, message.value); return { saved: true }; }
      const row = db.fields[id], item = row?.items.find(item => item.id === message.itemId);
      if (!item) throw new Error('这条记录已被删除，请重新打开历史');
      if (message.type === 'FIELD_USE') {
        const value = item.value; saveValue(db, id, ctx, field, value); return { value };
      }
      row.items = row.items.filter(item => item.id !== message.itemId);
      if (!row.items.length) delete db.fields[id];
      return { deleted: true };
    });
    return result;
  }
  if (message.type === 'OPEN_MANAGER') {
    if (!trusted(sender)) await context(sender, await snapshot());
    await chrome.runtime.openOptionsPage(); return { opened: true };
  }
  if (!trusted(sender)) throw new Error('无权执行此操作');
  if (message.type === 'SITE_STATUS') {
    const origin = siteOrigin(message.url), db = await snapshot();
    const granted = await chrome.permissions.contains({ origins: [hostPattern(origin)] });
    return { origin, enabled: Boolean(db.sites[origin]?.enabled && granted), ...stats(db, origin) };
  }
  if (message.type === 'SITE_SET') {
    const origin = siteOrigin(message.origin);
    if (message.enabled !== false) {
      const tab = await chrome.tabs.get(message.tabId);
      if (siteOrigin(tab.url) !== origin || !await chrome.permissions.contains({ origins: [hostPattern(origin)] })) throw new Error('请先在当前站点授予权限');
    }
    await change(db => { db.sites[origin] = { enabled: message.enabled !== false, updatedAt: Date.now() }; });
    await reconcile(); await notify(origin, message.enabled !== false);
    const db = await snapshot(); return { origin, enabled: db.sites[origin].enabled, ...stats(db, origin) };
  }
  if (message.type === 'MANAGER_GET') {
    const db = await snapshot();
    return { sites: db.sites, fields: Object.entries(db.fields).map(([id, row]) => ({ id, ...row })), totalFields: stats(db).fields, values: stats(db).values };
  }
  if (message.type === 'MANAGER_DELETE') {
    if (typeof message.fieldId !== 'string' || !/^[a-f0-9]{64}$/.test(message.fieldId)) throw new Error('字段编号无效');
    let origin;
    await change(db => {
      const row = db.fields[message.fieldId];
      if (!row) return;
      origin = row.origin;
      if (message.itemId) row.items = row.items.filter(item => item.id !== message.itemId);
      if (!message.itemId || !row.items.length) delete db.fields[message.fieldId];
    });
    if (origin) await notify(origin);
    return { deleted: true };
  }
  if (message.type === 'SITE_CLEAR') {
    const origin = siteOrigin(message.origin);
    await change(db => { for (const [id, row] of Object.entries(db.fields)) if (row.origin === origin) delete db.fields[id]; });
    await notify(origin); return { deleted: true };
  }
  throw new Error('不支持的操作');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') return false;
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message || '操作未完成，请重试' }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => { void reconcile().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { void reconcile().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { void (async () => {
  const db = await snapshot(), removed = [];
  for (const [origin, site] of Object.entries(db.sites)) if (site.enabled && !await chrome.permissions.contains({ origins: [hostPattern(origin)] })) removed.push(origin);
  if (removed.length) await change(current => { for (const origin of removed) if (current.sites[origin]) current.sites[origin].enabled = false; });
  await reconcile(); await Promise.allSettled(removed.map(origin => notify(origin)));
})().catch(() => {}); });
