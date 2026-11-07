export const LIMITS = { items: 30, fields: 300, value: 2048, bytes: 2 * 1024 * 1024 };
export function siteOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || ['chromewebstore.google.com', 'chrome.google.com'].includes(url.hostname)) throw new Error('请在普通网页上使用');
  return url.origin;
}
export function hostPattern(value) { const url = new URL(siteOrigin(value)); return `${url.protocol}//${url.hostname}/*`; }
export function pageScope(value) {
  const url = new URL(value); siteOrigin(value);
  let path = url.pathname.replace(/\/+$/, '') || '/';
  // Related parameter pages share history; separate page groups remain isolated.
  if (path.includes('/job/')) path = path.replace(/\/(build|buildWithParameters|parambuild)$/, '') || '/';
  if (path.length > 2048) throw new Error('页面地址过长');
  return path;
}
export function isSensitive(field) {
  if (!field || !['text', 'search', 'number', 'url', 'tel', 'email', 'textarea'].includes(field.kind)) return true;
  const text = [field.key, field.label, field.name, field.id, field.autocomplete, field.placeholder].filter(value => typeof value === 'string').join(' ').toLowerCase();
  return /password|passwd|passphrase|token|secret|credential|authorization|otpcode|verificationcode|one[-_ ]?time|(?:^|[^a-z])(?:otp|totp|hotp|pin|cvv|cvc|csrf|xsrf|username)(?:$|[^a-z])|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key|current-password|new-password|cc-|密码|口令|验证码|校验码|动态码|令牌|密钥|身份证|信用卡|银行卡/.test(text);
}
export function validateField(field) {
  if (!field || typeof field.key !== 'string' || !field.key || field.key.length > 512 || typeof field.label !== 'string' || field.label.length > 512 || isSensitive(field)) throw new Error('此字段不适合记录');
  const result = {};
  for (const name of ['key', 'label', 'name', 'id', 'autocomplete', 'placeholder', 'kind']) {
    if (field[name] !== undefined && (typeof field[name] !== 'string' || field[name].length > 512)) throw new Error('字段信息无效');
    result[name] = field[name] || '';
  }
  return result;
}
export function validateValue(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.value || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('只记录非空且不超过 2048 字符的普通输入');
  return value; // Preserve case, whitespace and leading zeroes exactly.
}
export async function fieldId(origin, path, key) {
  const bytes = new TextEncoder().encode(JSON.stringify([origin, path, key]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
