import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const filename = path.join(root, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(filename, 'utf8'));
if (!manifest.key) {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  manifest.key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
}
await build({ entryPoints: [path.join(root, 'src/content.js')], bundle: true, format: 'iife', platform: 'browser', target: 'chrome116', outfile: path.join(root, 'extension/content.js'), legalComments: 'eof' });
const icons = spawnSync('python3', [path.join(root, 'scripts/generate-icons.py')], { encoding: 'utf8' });
if (icons.status !== 0) throw new Error(icons.stderr);
await mkdir(path.join(root, 'dist'), { recursive: true });
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)].flatMap(n => [n >> 4, n & 15]).map(n => String.fromCharCode(97 + n)).join('');
await writeFile(path.join(root, 'dist/extension-id.txt'), id + '\n');
console.log(`Built 填记 ${manifest.version}; content scripts activate only on enabled sites.`);
