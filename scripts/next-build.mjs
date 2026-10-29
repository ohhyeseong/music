import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Sets the env var in Node so the build script works in cmd.exe as well as POSIX shells.
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [next, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
process.exit(result.status ?? 1);
