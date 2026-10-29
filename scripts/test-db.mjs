import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';

export function sqlAdmin(sql) {
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot'],
    { input: sql, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error('Test database administration failed. Check the local MySQL container.');
}
export async function createTestDatabase() {
  const name = `gyeol_${randomBytes(6).toString('hex')}_test`;
  if (!/^gyeol_[a-f0-9]+_test$/.test(name)) throw new Error('Invalid test database name');
  sqlAdmin(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON \`${name}\`.* TO 'gyeol'@'%';`,
  );
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  const env = {
    ...process.env,
    DATABASE_URL: url.href,
    NODE_ENV: 'test',
    CATALOG_MODE: 'demo',
    WEB_ORIGIN: 'http://localhost:3000',
  };
  try {
    for (const args of [
      ['--env-file=.env', 'scripts/migrate.mjs'],
      ['--import', 'tsx', '--env-file=.env', 'apps/api/prisma/seed.ts'],
    ]) {
      const result = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
      if (result.status !== 0)
        throw new Error(`Test database setup failed (${args.at(-1)}): ${result.stderr}`);
    }
  } catch (error) {
    sqlAdmin(`DROP DATABASE \`${name}\`;`);
    throw error;
  }
  return { env, cleanup: () => sqlAdmin(`DROP DATABASE \`${name}\`;`) };
}
export async function startApi(env, port, logName) {
  await mkdir('.runtime', { recursive: true });
  const log = await open(`.runtime/${logName}.log`, 'w');
  const processHandle = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', log.fd, log.fd],
  });
  await log.close();
  for (let i = 0; i < 300; i++) {
    if (processHandle.exitCode !== null)
      throw new Error(`API exited during startup. See .runtime/${logName}.log`);
    try {
      const r = await fetch(`http://localhost:${port}/v1/health/ready`);
      if (r.ok) return processHandle;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  processHandle.kill('SIGTERM');
  throw new Error('API readiness timed out');
}
export async function stopProcess(handle) {
  if (handle.exitCode !== null) return;
  const exited = new Promise((resolve) => handle.once('exit', resolve));
  handle.kill('SIGTERM');
  const timer = setTimeout(() => handle.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
}
