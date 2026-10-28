import { readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const store = join(root, 'node_modules/.pnpm');
const records = new Map();
async function inspect(path) {
  try {
    if (!(await lstat(path)).isDirectory()) return;
    const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    if (!manifest.name || !manifest.version) return;
    const key = `${manifest.name}@${manifest.version}`;
    if (records.has(key)) return;
    const files = (await readdir(path)).filter((name) =>
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
    );
    const texts = [];
    for (const name of files)
      if ((await lstat(join(path, name))).isFile())
        texts.push(await readFile(join(path, name), 'utf8'));
    records.set(key, {
      license:
        typeof manifest.license === 'string'
          ? manifest.license
          : JSON.stringify(manifest.license ?? 'See package source'),
      texts,
    });
  } catch {
    /* Packages without readable metadata are not distributed as package roots. */
  }
}
for (const directory of await readdir(store)) {
  const modules = join(store, directory, 'node_modules');
  let entries;
  try {
    entries = await readdir(modules);
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (entry.startsWith('@')) {
      for (const scoped of await readdir(join(modules, entry)))
        await inspect(join(modules, entry, scoped));
    } else await inspect(join(modules, entry));
  }
}
const lines = [
  'Roveran — third-party notices',
  '',
  'Dependency license texts from the installed workspace. Development-only tools may also be listed.',
  'OpenCV runtime licensing is supplied separately in runtime/LICENSE.txt.',
  '',
];
for (const [name, record] of [...records].sort((a, b) => a[0].localeCompare(b[0])))
  lines.push('='.repeat(72), name, `Declared license: ${record.license}`, ...record.texts, '');
await mkdir(join(root, 'apps/web/public'), { recursive: true });
await writeFile(join(root, 'apps/web/public/THIRD_PARTY_NOTICES.txt'), lines.join('\n'));
console.log(`Collected ${records.size} dependency notices.`);
