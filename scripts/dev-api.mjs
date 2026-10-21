import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const built = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json'],
  { stdio: 'inherit' },
);
if (built.status !== 0) process.exit(built.status || 1);
// Run emitted ESM directly: tsx's dual-module loading duplicates Nest 12's Reflector.
const compiler = spawn(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json', '--watch'],
  { stdio: 'inherit' },
);
const server = spawn(process.execPath, ['--watch', '--env-file=.env', 'apps/api/dist/main.js'], {
  stdio: 'inherit',
});
async function stop() {
  compiler.kill('SIGTERM');
  server.kill('SIGTERM');
  await Promise.allSettled([once(compiler, 'exit'), once(server, 'exit')]);
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
