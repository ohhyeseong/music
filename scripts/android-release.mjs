import { spawnSync } from 'node:child_process';
const value = process.env.NEXT_PUBLIC_API_URL;
if (!value)
  throw new Error(
    'Set NEXT_PUBLIC_API_URL to your deployed HTTPS API before generating a distributable bundle.',
  );
const url = new URL(value);
if (
  url.protocol !== 'https:' ||
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  !url.pathname.endsWith('/v1')
)
  throw new Error(
    'Use a public HTTPS API URL ending in /v1, without credentials or query parameters.',
  );
for (const [command, args] of [
  ['npm', ['run', 'android:sync']],
  ['./gradlew', ['--no-daemon', '--max-workers=2', ':app:bundleRelease', ':app:lintRelease']],
]) {
  const result = spawnSync(command, args, {
    cwd: command === 'npm' ? process.cwd() : 'apps/web/android',
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  'Unsigned release bundle generated. Signing, device verification and publication require separate steps.',
);
