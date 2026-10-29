import { readdir, readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const seen = new Set(),
  records = new Map();
async function locate(from, name) {
  for (let dir = from; ; dir = dirname(dir)) {
    try {
      return await realpath(join(dir, 'node_modules', name));
    } catch {
      /* Try the parent node_modules, following Node's lookup order. */
    }
    if (dirname(dir) === dir) throw new Error(`Cannot locate license metadata for ${name}`);
  }
}
async function inspect(path, dependencies = true) {
  path = await realpath(path);
  if (seen.has(path)) return;
  seen.add(path);
  const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  if (!manifest.name.startsWith('@opencv-weblab/')) {
    const files = (await readdir(path)).filter((name) =>
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
    );
    const texts = [];
    for (const name of files)
      try {
        texts.push(await readFile(join(path, name), 'utf8'));
      } catch {
        /* A license directory is not a text notice. */
      }
    records.set(`${manifest.name}@${manifest.version}`, {
      license:
        typeof manifest.license === 'string'
          ? manifest.license
          : JSON.stringify(manifest.license ?? 'See package source'),
      texts,
    });
  }
  if (dependencies)
    for (const name of Object.keys(manifest.dependencies ?? {}))
      await inspect(await locate(path, name));
}
const web = join(root, 'apps/web');
await inspect(web);
// The generated registration helper ships this dependency from the build plugin.
const plugin = await locate(web, 'vite-plugin-pwa');
await inspect(plugin, false);
await inspect(await locate(plugin, 'workbox-window'));
const lines = [
  'OpenCV WebLab — third-party notices',
  '',
  await readFile(join(root, 'NOTICE'), 'utf8'),
  '',
  'License texts for the frontend dependency closure and service-worker registration helper.',
  'OpenCV licensing is supplied separately in runtime/LICENSE.txt.',
  '',
];
for (const [name, record] of [...records].sort((a, b) => a[0].localeCompare(b[0])))
  lines.push('='.repeat(72), name, `Declared license: ${record.license}`, ...record.texts, '');
await mkdir(join(web, 'public'), { recursive: true });
await writeFile(join(web, 'public/THIRD_PARTY_NOTICES.txt'), lines.join('\n'));
console.log(`Collected ${records.size} shipped dependency notices.`);
