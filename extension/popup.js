import { siteOrigin, hostPattern } from './lib/rules.js';
const $ = id => document.getElementById(id);
let tab, state;
async function send(type, extra = {}) { const value = await chrome.runtime.sendMessage({ type, ...extra }); if (!value?.ok) throw new Error(value?.error || '操作未完成'); return value.data; }
function render() {
  $('site').textContent = state.origin; $('field-count').textContent = state.fields; $('value-count').textContent = state.values;
  $('status').textContent = state.enabled ? '已启用。输入完成后离开字段即可记住，下次点旁边的按钮选择。' : '尚未记录此站点。启用后只在这一个站点保存普通输入历史。';
  $('toggle').textContent = state.enabled ? '暂停本站记录' : '启用本站记录'; $('toggle').className = (state.enabled ? 'secondary' : 'primary') + ' wide'; $('toggle').disabled = false;
}
async function load() {
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); siteOrigin(tab?.url); state = await send('SITE_STATUS', { url: tab.url }); render(); }
  catch { $('site').textContent = '先打开需要使用的网页'; $('status').textContent = '浏览器内部页面、扩展页面和应用商店不能启用输入记录。'; $('toggle').disabled = true; }
}
$('toggle').onclick = async () => {
  if (!state) return;
  $('toggle').disabled = true; $('message').hidden = true;
  try {
    if (!state.enabled && !await chrome.permissions.request({ origins: [hostPattern(state.origin)] })) throw new Error('未授予本站访问权限，尚未开始记录');
    state = await send('SITE_SET', { origin: state.origin, enabled: !state.enabled, tabId: tab.id }); render();
  } catch (error) { $('message').textContent = error.message; $('message').hidden = false; $('toggle').disabled = false; }
};
$('manage').onclick = () => chrome.runtime.openOptionsPage();
$('privacy').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
void load();
