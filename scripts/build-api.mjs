import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(`${root}apps/api/package.json`, 'utf8'));
await build({
  entryPoints: [`${root}apps/api/src/index.ts`, `${root}apps/api/src/migrate.ts`],
  outdir: `${root}apps/api/dist`,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  external: Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@roveran/')),
  sourcemap: true,
});
