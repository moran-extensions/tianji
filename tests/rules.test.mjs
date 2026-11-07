import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOrigin, hostPattern, pageScope, isSensitive, validateField, validateValue, fieldId, LIMITS } from '../extension/lib/rules.js';
import { emptyData, saveValue, stats, prune } from '../extension/lib/history.js';
const sampleText = { key: 'parameter:CONTENT', label: 'CONTENT', name: 'value', kind: 'text' };
test('Page scopes isolate page groups, sites and ports without retaining query parameters', async () => {
  assert.equal(siteOrigin('http://forms.example.test:8080/job/a/build?token=never-store'), 'http://forms.example.test:8080');
  assert.equal(hostPattern('http://forms.example.test:8080'), 'http://forms.example.test/*');
  assert.equal(pageScope('https://forms.example.test/job/team/job/a/build?delay=0#x'), '/job/team/job/a');
  assert.equal(pageScope('https://forms.example.test/job/team/job/a/parambuild'), '/job/team/job/a');
  const ids = await Promise.all([['http://forms.example.test:8080','/job/a','parameter:CONTENT'],['http://forms.example.test:8081','/job/a','parameter:CONTENT'],['http://forms.example.test:8080','/job/b','parameter:CONTENT'],['http://forms.example.test:8080','/job/a','parameter:REFERENCE']].map(args => fieldId(...args)));
  assert.equal(new Set(ids).size, 4);
  for (const value of ['chrome://extensions','file:///tmp/test','https://user:password@example.test','https://chromewebstore.google.com/']) assert.throws(() => siteOrigin(value));
});
test('password and recognizable secrets are blocked independently in metadata', () => {
  assert.equal(isSensitive(sampleText), false); assert.equal(isSensitive({ ...sampleText, key: 'parameter:REFERENCE', label: '参考编号' }), false);
  for (const text of ['password','API_TOKEN','accessToken','clientSecret','验证码','one-time-code','apiKey','private_key','csrf','cc-number','身份证']) assert.throws(() => validateField({ ...sampleText, label: text }));
  for (const kind of ['password','hidden','file','checkbox','select']) assert.throws(() => validateField({ ...sampleText, kind }));
});
test('ordinary values retain leading zeroes, case and whitespace; blanks and oversized values rejected', () => {
  assert.equal(validateValue(' 0007-AbC '), ' 0007-AbC ');
  for (const value of ['', '   ', null, 'x'.repeat(LIMITS.value + 1), 'value\u0000']) assert.throws(() => validateValue(value));
});
test('duplicates move to recent history without creating extra rows; per-field cap enforced', () => {
  const db = emptyData(), ctx = { origin: 'https://forms.example.test', path: '/job/a' };
  saveValue(db, 'field', ctx, sampleText, '0007', 1); saveValue(db, 'field', ctx, sampleText, '0008', 2); saveValue(db, 'field', ctx, sampleText, '0007', 3);
  assert.deepEqual(db.fields.field.items.map(item => item.value), ['0007','0008']); assert.equal(db.fields.field.items[0].uses, 2);
  for (let n = 0; n < 40; n++) saveValue(db, 'field', ctx, sampleText, 'SAMPLE-' + n, n + 10);
  assert.equal(db.fields.field.items.length, 30); assert.equal(db.fields.field.items[0].value, 'SAMPLE-39');
  assert.deepEqual(stats(db), { fields: 1, values: 30 });
});
test('field-count and total byte budgets bound local history', () => {
  const db = emptyData();
  for (let n = 0; n < 305; n++) db.fields['field' + n] = { origin: 'https://forms.example.test', path: '/', label: 'CONTENT', updatedAt: n, items: [{ value: 'x'.repeat(8000) }] };
  prune(db);
  assert.ok(Object.keys(db.fields).length <= LIMITS.fields);
  assert.ok(new TextEncoder().encode(JSON.stringify(db)).length <= LIMITS.bytes);
});
