import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(['activeTab', 'scripting'])) throw new Error('Unexpected permissions');
if (manifest.host_permissions || manifest.content_scripts || manifest.externally_connectable || manifest.incognito !== 'not_allowed') throw new Error('Unexpected unconditional site access');
async function walk(dir) { const result = []; for (const item of await readdir(dir, { withFileTypes: true })) { const name = path.join(dir, item.name); result.push(...item.isDirectory() ? await walk(name) : [name]); } return result; }
for (const file of await walk(path.join(root, 'extension'))) if (file.endsWith('.js')) {
  const source = await readFile(file, 'utf8');
  if (/\bfetch\s*\(|XMLHttpRequest|new WebSocket|\.submit\s*\(|\.requestSubmit\s*\(|\.innerHTML\s*=|\beval\s*\(/.test(source)) throw new Error('Unexpected network, submission or unsafe rendering code: ' + file);
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(checked.stderr);
}
console.log('Syntax, opt-in permission, local-only and no-submission checks passed.');
