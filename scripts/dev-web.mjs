import { spawn } from 'node:child_process';
const builder = spawn(process.execPath, ['../../scripts/build-worker.mjs', '--watch'], {
  stdio: 'inherit',
});
const vite = spawn('pnpm', ['exec', 'vite', '--host', '0.0.0.0'], { stdio: 'inherit' });
function stop() {
  builder.kill();
  vite.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', (code) => {
  stop();
  process.exitCode = code ?? 0;
});
