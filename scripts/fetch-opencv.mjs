import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../apps/web/public/runtime/', import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/package.json`, '{"type":"commonjs"}\n');
const url = 'https://docs.opencv.org/4.13.0/opencv.js';
let manifest;
try {
  manifest = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
} catch {}
try {
  const existing = await readFile(`${dir}/opencv.js`);
  if (manifest?.sha256 === createHash('sha256').update(existing).digest('hex')) {
    console.log('OpenCV 4.13.0 is installed and checksum verified.');
    process.exit(0);
  }
} catch {}
const response = await fetch(url);
if (!response.ok) throw new Error(`OpenCV download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 100000 || bytes.subarray(0, 200).toString().includes('<!DOCTYPE'))
  throw new Error('Unexpected OpenCV download.');
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (manifest?.sha256 && manifest.sha256 !== sha256)
  throw new Error('Runtime checksum changed; inspect upstream before upgrading.');
await writeFile(`${dir}/opencv.js`, bytes);
await writeFile(
  `${dir}/manifest.json`,
  JSON.stringify({ version: '4.13.0', url, sha256, bytes: bytes.length }, null, 2) + '\n',
);
const license = await fetch('https://raw.githubusercontent.com/opencv/opencv/4.13.0/LICENSE');
if (!license.ok) throw new Error('Cannot download OpenCV license');
await writeFile(`${dir}/LICENSE.txt`, await license.text());
console.log(
  `Downloaded OpenCV 4.13.0 (${(bytes.length / 1024 / 1024).toFixed(1)} MiB); SHA-256 ${sha256}`,
);
