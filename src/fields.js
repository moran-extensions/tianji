import { isSensitive } from '../extension/lib/rules.js';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 512);
export function describeField(node) {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || node.disabled || node.readOnly || node.closest('[data-cj3-owned]')) return null;
  const kind = node instanceof HTMLTextAreaElement ? 'textarea' : node.type;
  if (!['text', 'search', 'number', 'url', 'tel', 'email', 'textarea'].includes(kind) || node.closest('.select2-search,.ant-select-selection-search,.el-select__wrapper,[role=listbox]')) return null;
  const rect = node.getBoundingClientRect();
  if (!node.isConnected || rect.width < 20 || rect.height < 12 || getComputedStyle(node).visibility !== 'visible' || getComputedStyle(node).display === 'none') return null;
  const form = node.form;
  if (form && /j_acegi_security_check|j_spring_security_check|\/(login|signin)(?:[/?]|$)/i.test(form.getAttribute('action') || '')) return null;
  let parameter = '';
  // Some forms render different fields with name="value". The neighbouring hidden
  // name identifies the field; hidden values themselves are never recorded.
  for (let parent = node.parentElement, depth = 0; parent && depth < 5 && parent !== form && parent !== document.body; parent = parent.parentElement, depth++) {
    const names = parent.querySelectorAll('input[type="hidden"][name="name"]');
    if (names.length === 1) { parameter = clean(names[0].value); break; }
    if (names.length > 1) break;
  }
  const label = clean(node.labels?.[0]?.textContent || node.getAttribute('aria-label') || parameter || node.closest('.jenkins-form-item,.form-group,tr')?.querySelector('.jenkins-form-label,.setting-name,label')?.textContent || node.placeholder || node.name || node.id);
  let key;
  if (parameter) key = 'parameter:' + parameter;
  else if (node.name && !/^(value|input|text)$/i.test(node.name)) {
    const peers = [...(form || document).querySelectorAll('input,textarea')].filter(item => item.name === node.name);
    key = 'name:' + node.name + (peers.length > 1 ? ':' + (label || peers.indexOf(node)) : '');
  } else if (label) key = 'label:' + label;
  else if (node.id) key = 'id:' + node.id;
  else key = 'position:' + [...document.querySelectorAll('input,textarea')].indexOf(node);
  const field = { key, label: label || '未命名输入框', kind, name: clean(node.name), id: clean(node.id), autocomplete: clean(node.autocomplete), placeholder: clean(node.placeholder) };
  return key.length <= 512 && !isSensitive(field) ? field : null;
}
export function acceptsValue(node, value) {
  if (!describeField(node) || typeof value !== 'string') return false;
  if (node.maxLength >= 0 && value.length > node.maxLength) return false;
  const clone = node.cloneNode(false); clone.value = value;
  return clone.value === value && clone.validity.valid;
}
export function fillValue(node, value) {
  if (!acceptsValue(node, value)) throw new Error('当前输入框不接受这个值，请检查长度或格式限制');
  const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  node.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  if (node.isConnected) node.focus({ preventScroll: true });
}
