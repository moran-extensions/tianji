import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostPattern } from '../extension/lib/rules.js';
const events = () => ({ callbacks: [], addListener(fn) { this.callbacks.push(fn); }, emit(...args) { for (const fn of this.callbacks) fn(...args); } });
const id = 'test-extension', store = {}, scripts = new Map(), grants = new Set(), notifications = [];
let listener;
globalThis.indexedDB = { open() {
  const request = {};
  queueMicrotask(() => {
    request.result = { createObjectStore() {}, close() {}, transaction() {
      const tx = { objectStore() { return {
        get() { const result = {}; queueMicrotask(() => { result.result = structuredClone(store.cj3Data); result.onsuccess?.(); }); return result; },
        put(value) { const copy = structuredClone(value); setTimeout(() => { store.cj3Data = copy; tx.oncomplete?.(); }, 1); }
      }; } }; return tx;
    } };
    request.onupgradeneeded?.(); request.onsuccess?.();
  });
  return request;
} };
globalThis.chrome = {
  runtime: { id, getURL: value => `chrome-extension://${id}/${value}`, onMessage: { addListener(fn) { listener = fn; } }, onInstalled: events(), onStartup: events(), async openOptionsPage() {} },
  permissions: { async contains({ origins }) { return origins.every(origin => grants.has(origin)); }, onRemoved: events() },
  scripting: { async getRegisteredContentScripts() { return [...scripts.values()]; }, async registerContentScripts(items) { for (const item of items) { assert.equal(scripts.has(item.id), false); scripts.set(item.id, item); } }, async unregisterContentScripts({ ids }) { for (const id of ids) scripts.delete(id); }, async executeScript() {} },
  tabs: { async get(tabId) { return { id: tabId, url: 'http://forms.example.test:8080/job/a/build' }; }, async query() { return []; }, async sendMessage(tabId, value) { notifications.push({ tabId, value }); } }
};
await import('../extension/background.js');
const own = { id, url: `chrome-extension://${id}/manager.html`, tab: { id: 9 }, frameId: 0 };
const page = path => ({ id, url: 'http://forms.example.test:8080' + path, tab: { id: 1, incognito: false }, frameId: 0 });
const sender = page('/job/a/build?secret=not-stored');
const field = { key: 'parameter:CONTENT', label: 'CONTENT', name: 'value', kind: 'text' };
const request = (type, extra = {}, from = own) => new Promise(resolve => listener({ type, ...extra }, from, resolve));
async function ok(type, extra, from) { const result = await request(type, extra, from); assert.equal(result.ok, true, result.error); return result.data; }
test('opt-in permissions, isolated field scope, serialized writes, management and revocation', async () => {
  assert.equal((await ok('CONTEXT', {}, sender)).enabled, false);
  assert.equal((await request('FIELD_SAVE', { field, value: 'not allowed' }, sender)).ok, false);
  assert.equal((await request('SITE_SET', { origin: 'http://forms.example.test:8080', tabId: 1 })).ok, false);
  grants.add(hostPattern('http://forms.example.test:8080'));
  await ok('SITE_SET', { origin: 'http://forms.example.test:8080', tabId: 1, enabled: true }); assert.equal(scripts.size, 1);
  assert.equal((await ok('CONTEXT', {}, sender)).enabled, true);
  await Promise.all(Array.from({ length: 20 }, (_, n) => ok('FIELD_SAVE', { field, value: 'SAMPLE-' + n, origin: 'https://fake.test', path: '/job/other' }, sender)));
  const values = await ok('FIELD_GET', { field }, sender); assert.equal(values.items.length, 20);
  assert.equal((await ok('FIELD_GET', { field: { ...field, key: 'parameter:REFERENCE', label: '参考编号' } }, sender)).items.length, 0);
  assert.equal((await ok('FIELD_GET', { field }, page('/job/b/build'))).items.length, 0);
  assert.equal((await ok('CONTEXT', {}, { ...sender, url: 'http://forms.example.test:8081/job/a/build' })).enabled, false);
  assert.equal((await ok('CONTEXT', {}, { ...sender, frameId: 1 })).enabled, false);
  assert.equal((await ok('CONTEXT', {}, { ...sender, tab: { id: 1, incognito: true } })).enabled, false);
  assert.equal((await request('FIELD_SAVE', { field: { ...field, label: 'API_TOKEN' }, value: 'do not store' }, sender)).ok, false);
  const manager = await ok('MANAGER_GET'); assert.equal(manager.fields.length, 1); assert.equal(manager.fields[0].path, '/job/a'); assert.equal(manager.fields[0].origin, 'http://forms.example.test:8080');
  assert.equal(JSON.stringify(store).includes('not-stored'), false);
  assert.equal((await request('MANAGER_GET', {}, sender)).ok, false);
  assert.equal((await request('MANAGER_DELETE', { fieldId: '__proto__' })).ok, false);
  const chosen = await ok('FIELD_USE', { field, itemId: values.items[0].id }, sender); assert.equal(chosen.value, values.items[0].value);
  await ok('FIELD_DELETE', { field, itemId: values.items[0].id }, sender); assert.equal((await ok('FIELD_GET', { field }, sender)).items.length, 19);
  await ok('SITE_SET', { origin: 'http://forms.example.test:8080', enabled: false }); assert.equal(scripts.size, 0);
  assert.equal((await request('FIELD_SAVE', { field, value: 'paused' }, sender)).ok, false);
  assert.equal((await ok('MANAGER_GET')).values, 19);
  await ok('SITE_SET', { origin: 'http://forms.example.test:8080', tabId: 1 });
  grants.clear(); chrome.permissions.onRemoved.emit({ origins: ['http://forms.example.test/*'] });
  for (let n = 0; n < 100 && store.cj3Data.sites['http://forms.example.test:8080'].enabled; n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(store.cj3Data.sites['http://forms.example.test:8080'].enabled, false); assert.ok(notifications.some(item => item.tabId === 1));
  assert.equal((await request('FIELD_GET', { field }, sender)).ok, false);
  await ok('SITE_CLEAR', { origin: 'http://forms.example.test:8080' }); assert.equal((await ok('MANAGER_GET')).values, 0);
  assert.equal(listener({ type: 'MANAGER_GET' }, { id: 'other', url: 'https://evil.test' }, () => {}), false);
});
