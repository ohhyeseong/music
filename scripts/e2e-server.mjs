import { spawn } from 'node:child_process';
import { createTestDatabase, startApi, stopProcess } from './test-db.mjs';
let database, api, web, stopping;
async function stop(code = 0) {
  if (stopping) return stopping;
  stopping = (async () => {
    if (web) await stopProcess(web);
    if (api) await stopProcess(api);
    database?.cleanup();
    process.exit(code);
  })();
  return stopping;
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
try {
  database = await createTestDatabase();
  api = await startApi(database.env, 4000, 'e2e-api');
  web = spawn(process.execPath, ['scripts/serve-web.mjs'], { env: database.env, stdio: 'inherit' });
  web.once('exit', () => {
    if (!stopping) void stop(1);
  });
  api.once('exit', () => {
    if (!stopping) void stop(1);
  });
} catch (error) {
  console.error(error.message);
  await stop(1);
}
