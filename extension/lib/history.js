import { LIMITS, validateValue } from './rules.js';
export function emptyData() { return { version: 1, sites: {}, fields: {} }; }
export function saveValue(db, id, context, field, value, now = Date.now()) {
  validateValue(value);
  const row = db.fields[id] || { origin: context.origin, path: context.path, key: field.key, label: field.label, kind: field.kind, updatedAt: now, items: [] };
  row.label = field.label; row.kind = field.kind; row.updatedAt = now;
  const found = row.items.find(item => item.value === value);
  if (found) { found.lastUsed = now; found.uses++; }
  else row.items.push({ id: crypto.randomUUID(), value, createdAt: now, lastUsed: now, uses: 1 });
  row.items.sort((a, b) => b.lastUsed - a.lastUsed || b.createdAt - a.createdAt);
  row.items = row.items.slice(0, LIMITS.items); db.fields[id] = row;
  prune(db);
  return row;
}
export function prune(db) {
  const entries = Object.entries(db.fields).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  for (const [id] of entries.slice(LIMITS.fields)) delete db.fields[id];
  const size = () => new TextEncoder().encode(JSON.stringify(db)).length;
  while (size() > LIMITS.bytes) {
    const oldest = Object.entries(db.fields).sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) throw new Error('本机记录空间已满');
    oldest[1].items.pop();
    if (!oldest[1].items.length) delete db.fields[oldest[0]];
  }
}
export function stats(db, origin) {
  const rows = Object.values(db.fields).filter(row => !origin || row.origin === origin);
  return { fields: rows.length, values: rows.reduce((n, row) => n + row.items.length, 0) };
}
