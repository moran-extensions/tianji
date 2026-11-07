import { describeField, acceptsValue, fillValue } from './fields.js';
import { pageScope } from '../extension/lib/rules.js';

(() => {
  if (window !== window.top || globalThis.__cj3History || !document.documentElement) return;
  let enabled = false, active = null, opened = false, items = [], context = null, refreshId = 0;
  let dirty = new Map(), saving = new WeakMap(), frame = 0;
  const host = document.createElement('div'); host.id = 'chajian3-field-history'; host.dataset.cj3Owned = 'true';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;overflow:visible!important;pointer-events:none!important;color-scheme:light!important}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0}button:disabled{cursor:default;opacity:.5}[hidden]{display:none!important}button:focus-visible,input:focus-visible{outline:3px solid #adc6ff;outline-offset:2px}
    #trigger{position:fixed;width:40px;height:40px;display:grid;place-items:center;border:1px solid #d8e2f1;border-radius:11px;background:#fff;color:#245bd4;box-shadow:0 3px 12px #15315d18;pointer-events:auto;padding:10px}#trigger:hover{background:#eef4ff;border-color:#adc6ff}
    #panel{position:fixed;width:350px;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);padding:16px;border:1px solid #dbe3ee;border-radius:15px;background:#fff;box-shadow:0 12px 42px #182f532b;color:#182c49;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;pointer-events:auto;overflow:auto;text-align:left;letter-spacing:normal}
    .heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}h2{font-size:15px;line-height:1.5;margin:0;overflow-wrap:anywhere}.sub{font-size:11px;color:#62718a;margin:0 0 12px}#close{width:32px;height:32px;flex:none;border-radius:8px;background:#f0f3f8;color:#61718c;font-size:20px}
    #search{display:block;width:100%;min-height:40px;border:1px solid #dbe3ee;border-radius:9px;padding:9px 11px;background:#f8faff;color:#182c49;font-size:13px;margin:0 0 10px}#search::placeholder{color:#75839a}
    #list{max-height:224px;overflow:auto;overscroll-behavior:contain}.row{display:flex;align-items:stretch;gap:4px;border-radius:9px;margin:3px 0}.row:hover{background:#f1f5fc}.value{flex:1;min-width:0;text-align:left;background:transparent;color:#243e67;padding:10px 9px;border-radius:9px;min-height:43px;overflow-wrap:anywhere;white-space:pre-wrap;font-size:13px}.delete{width:34px;flex:none;align-self:center;height:34px;border-radius:8px;background:transparent;color:#8a96a9;font-size:17px}.delete:hover{color:#b42318;background:#fff0ee}.value:disabled{opacity:.55}.unavailable{font-size:10px;display:block;color:#986a31}.empty{padding:20px 8px;text-align:center;color:#718099;font-size:12px}
    #notice{font-size:12px;color:#62718a;overflow-wrap:anywhere;margin:8px 0 0}#notice[data-error=true]{color:#b42318}.footer{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #e8edf4;margin-top:12px;padding-top:11px}.footer button{min-height:34px;padding:6px 10px;border-radius:8px;font-size:12px}#save{background:#eaf1ff;color:#245bd4}#manage{background:transparent;color:#62718a}.hint{margin:10px 0 0;color:#8490a3;font-size:10px}
    @media(prefers-color-scheme:dark){:host{color-scheme:dark!important}#trigger,#panel{background:#17243a;color:#e6edf8;border-color:#394a66}#trigger{color:#b6ceff}#trigger:hover,.row:hover{background:#233958}#close{background:#23354e;color:#c0cce0}#search{background:#101d31;border-color:#394a66;color:#e6edf8}.value{color:#d3e1f8}.sub,#notice,#manage{color:#b5c1d5}.delete{color:#9eacc0}.delete:hover{background:#482b31;color:#ffc1b9}.footer{border-color:#34435b}#save{background:#274675;color:#deebff}.hint{color:#9cabc2}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  `;
  const node = (tag, text, props = {}) => {
    const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
    Object.assign(element, props); return element;
  };
  const button = (id, text) => node('button', text, { id, type: 'button' });
  const trigger = button('trigger', ''); trigger.setAttribute('aria-label', '打开输入历史'); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
  for (const d of ['M3 11a9 9 0 1 1 2.6 7', 'M3 4v7h7', 'M12 7v5l3 2']) { const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', d); icon.append(path); }
  trigger.append(icon); trigger.hidden = true;
  const panel = node('section', undefined, { id: 'panel', hidden: true }); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '字段输入历史');
  const heading = node('div', undefined, { className: 'heading' }), title = node('h2', '输入历史'), close = button('close', '×'); close.setAttribute('aria-label', '关闭输入历史'); heading.append(title, close);
  const sub = node('p', '最近使用 · 最多 30 条', { className: 'sub' });
  const search = node('input', undefined, { id: 'search', type: 'search', placeholder: '搜索这个字段的历史值', autocomplete: 'off' }); search.setAttribute('aria-label', '搜索当前字段历史');
  const list = node('div', undefined, { id: 'list' }), notice = node('p', '', { id: 'notice', hidden: true }); notice.setAttribute('role', 'status');
  const footer = node('div', undefined, { className: 'footer' }), save = button('save', '保存当前值'), manage = button('manage', '管理记录 ↗'); footer.append(save, manage);
  panel.append(heading, sub, search, list, notice, footer, node('p', '仅保存到本机 · 回填不会主动提交表单', { className: 'hint' }));
  shadow.append(style, trigger, panel);
  const trustedClick = (element, fn) => element.addEventListener('click', event => { event.stopPropagation(); if (event.isTrusted) void fn(event); });
  async function send(type, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type, ...extra });
    if (!result?.ok) throw new Error(result?.error || '插件已更新，请刷新网页后重试');
    return result.data;
  }
  function status(text, error = false) { notice.hidden = !text; notice.textContent = text; notice.dataset.error = String(error); }
  function hidePanel(focus = false) {
    opened = false; panel.hidden = true; list.replaceChildren(); items = []; search.value = ''; trigger.setAttribute('aria-expanded', 'false');
    if (focus && active?.isConnected) active.focus({ preventScroll: true });
  }
  function hide() { hidePanel(); trigger.hidden = true; active = null; host.remove(); }
  function position() {
    frame = 0; if (!active || !enabled || !describeField(active)) { hide(); return; }
    const rect = active.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) { trigger.hidden = true; panel.hidden = true; return; }
    trigger.hidden = false; panel.hidden = !opened;
    let left = rect.right + 6, top = rect.top + (rect.height - 40) / 2;
    if (left + 40 > innerWidth - 6) { left = rect.left - 46; if (left < 6) { left = Math.max(6, rect.right - 40); top = rect.top >= 46 ? rect.top - 44 : rect.bottom + 4; } }
    trigger.style.left = `${Math.max(6, left)}px`; trigger.style.top = `${Math.max(6, Math.min(innerHeight - 44, top))}px`;
    if (opened) {
      const width = Math.min(350, innerWidth - 20), height = Math.min(panel.offsetHeight || 300, innerHeight - 20);
      panel.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - width - 10))}px`;
      panel.style.top = `${Math.max(10, rect.bottom + 8 + height <= innerHeight - 10 ? rect.bottom + 8 : rect.top - height - 8)}px`;
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(position); }
  function activate(target) {
    if (!enabled || !describeField(target)) { hide(); return; }
    if (active !== target) { hidePanel(); active = target; }
    if (!host.isConnected) document.documentElement.append(host);
    trigger.setAttribute('aria-label', `打开 ${describeField(target).label} 的输入历史`);
    schedule();
  }
  async function remember(target, manual = false) {
    if (!enabled || (!manual && !dirty.has(target))) return;
    const candidate = dirty.get(target); dirty.delete(target);
    const field = describeField(target), value = manual ? target.value : candidate?.value;
    if (!manual && (!field || candidate?.key !== field.key)) return;
    if (!field || !value.trim() || value.length > 2048) { if (manual) throw new Error('请输入不超过 2048 字符的非空普通内容'); return; }
    const task = send('FIELD_SAVE', { field, value }); saving.set(target, task);
    try { await task; } finally { if (saving.get(target) === task) saving.delete(target); }
  }
  function draw() {
    list.replaceChildren();
    const query = search.value.toLocaleLowerCase(), filtered = items.filter(item => item.value.toLocaleLowerCase().includes(query));
    if (!filtered.length) list.append(node('p', items.length ? '没有匹配的历史值' : '还没有记录。输入完成后离开输入框会自动保存。', { className: 'empty' }));
    for (const item of filtered) {
      const row = node('div', undefined, { className: 'row' }), value = button('', item.value), remove = button('', '×');
      value.className = 'value'; value.title = item.value; value.disabled = !acceptsValue(active, item.value); value.dataset.itemId = item.id;
      if (value.disabled) value.append(node('span', '当前字段不接受此值', { className: 'unavailable' }));
      remove.className = 'delete'; remove.setAttribute('aria-label', '删除这条历史记录');
      trustedClick(value, () => choose(item));
      trustedClick(remove, async () => {
        try { await send('FIELD_DELETE', { field: describeField(active), itemId: item.id }); await load(); } catch (error) { status(error.message, true); }
      });
      row.append(value, remove); list.append(row);
    }
    save.disabled = !active?.value.trim(); schedule();
  }
  async function load() {
    const target = active, field = describeField(target), revision = ++refreshId;
    if (!field) { hide(); return; }
    const result = await send('FIELD_GET', { field });
    if (active !== target || revision !== refreshId || !opened) return;
    items = result.items; title.textContent = field.label + ' · 输入历史'; draw();
  }
  async function choose(item) {
    const target = active, field = describeField(target);
    try {
      if (!field || !context || pageScope(location.href) !== context.path || !acceptsValue(target, item.value)) throw new Error('页面或字段已变化，请重新打开历史');
      const result = await send('FIELD_USE', { field, itemId: item.id });
      if (active !== target || describeField(target)?.key !== field.key || pageScope(location.href) !== context.path) throw new Error('字段已变化，未回填');
      dirty.delete(target); hidePanel(); fillValue(target, result.value);
    } catch (error) { status(error.message, true); }
  }
  trustedClick(trigger, async () => {
    if (opened) { hidePanel(true); return; }
    try {
      if (!describeField(active)) { hide(); return; }
      const pending = saving.get(active); if (pending) await pending; else await remember(active);
      opened = true; panel.hidden = false; search.value = ''; status(''); trigger.setAttribute('aria-expanded', 'true');
      list.replaceChildren(node('p', '正在读取历史…', { className: 'empty' })); schedule(); await load(); search.focus({ preventScroll: true });
    } catch (error) { if (opened) status(error.message, true); else { trigger.title = error.message; } }
  });
  trustedClick(close, () => hidePanel(true));
  trustedClick(save, async () => { try { await remember(active, true); await load(); status('当前值已保存'); } catch (error) { status(error.message, true); } });
  trustedClick(manage, async () => { try { await send('OPEN_MANAGER'); } catch (error) { status(error.message, true); } });
  search.addEventListener('input', () => { if (opened) draw(); });
  shadow.addEventListener('keydown', event => {
    event.stopPropagation(); if (!event.isTrusted) return;
    if (event.key === 'Escape') { event.preventDefault(); hidePanel(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = [...list.querySelectorAll('.value:not(:disabled)')]; if (!buttons.length) return;
      event.preventDefault(); const index = buttons.indexOf(shadow.activeElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
    if (event.key === 'Enter' && event.target === search) {
      event.preventDefault(); const first = list.querySelector('.value:not(:disabled)'); const item = items.find(item => item.id === first?.dataset.itemId); if (item) void choose(item);
    }
  });
  for (const type of ['click', 'mousedown', 'submit']) shadow.addEventListener(type, event => { event.stopPropagation(); if (type === 'submit') event.preventDefault(); });
  document.addEventListener('focusin', event => { if (event.composedPath().includes(host)) return; activate(event.target); }, true);
  document.addEventListener('input', event => {
    if (!enabled || event.composedPath().includes(host)) return;
    const field = describeField(event.target);
    if (event.isTrusted && field) dirty.set(event.target, { key: field.key, value: event.target.value }); else dirty.delete(event.target);
  }, true);
  for (const type of ['change', 'focusout']) document.addEventListener(type, event => {
    if (event.isTrusted && enabled && !event.composedPath().includes(host)) void remember(event.target).catch(() => {});
  }, true);
  document.addEventListener('submit', event => { if (enabled && event.isTrusted) for (const target of [...dirty.keys()]) if (target.form === event.target) void remember(target).catch(() => {}); }, true);
  document.addEventListener('pointerdown', event => { if (event.isTrusted && !event.composedPath().includes(host)) hidePanel(); }, true);
  window.addEventListener('scroll', schedule, { passive: true, capture: true }); window.addEventListener('resize', schedule, { passive: true });
  new MutationObserver(() => { if (active && !active.isConnected) hide(); else if (active) schedule(); }).observe(document.documentElement, { childList: true, subtree: true });
  async function refresh() {
    try { context = await send('CONTEXT'); enabled = context.enabled; if (!enabled) { dirty.clear(); hide(); } else if (opened) await load(); else if (describeField(document.activeElement)) activate(document.activeElement); }
    catch { enabled = false; dirty.clear(); hide(); }
  }
  chrome.runtime.onMessage.addListener((message, sender) => { if (sender.id === chrome.runtime.id && message.type === 'CJ3_REFRESH') void refresh(); });
  globalThis.__cj3History = { refresh };
  void refresh();
})();
