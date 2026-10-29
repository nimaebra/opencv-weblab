import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
const nested = process.argv.includes('--nested');
const directory = nested
  ? await mkdtemp(join(tmpdir(), 'opencv-weblab-nested-'))
  : resolve('apps/web/dist');
const mount = nested ? '/lab/' : '/';
if (nested) {
  const builder = spawn(
    'pnpm',
    [
      '--filter',
      '@opencv-weblab/web',
      'exec',
      'vite',
      'build',
      '--base=/lab/',
      '--outDir',
      directory,
    ],
    { stdio: 'inherit' },
  );
  const code = await new Promise((resolve) => builder.on('exit', resolve));
  if (code !== 0) process.exit(Number(code) || 1);
}
let revision = 0;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/__test__/sw-version' && req.method === 'POST') {
      revision++;
      res.writeHead(200).end(String(revision));
      return;
    }
    if (!pathname.startsWith(mount)) {
      res.writeHead(404).end();
      return;
    }
    const path = resolve(directory, pathname.slice(mount.length) || 'index.html');
    if (!path.startsWith(directory + '/')) {
      res.writeHead(404).end();
      return;
    }
    let bytes = await readFile(path);
    if (path === join(directory, 'sw.js'))
      bytes = Buffer.concat([bytes, Buffer.from(`\n// test revision ${revision}\n`)]);
    res
      .writeHead(200, {
        'content-type': types[extname(path)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(nested ? 4174 : 4173, '127.0.0.1');
async function stop() {
  server.close();
  if (nested) await rm(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
