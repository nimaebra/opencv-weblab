import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const options = {
  entryPoints: [`${root}packages/engine/src/worker.ts`],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: `${root}apps/web/public/engine-worker.js`,
  sourcemap: true,
  minify: !process.argv.includes('--watch'),
};
if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else await build(options);
