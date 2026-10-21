import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const password = randomBytes(20).toString('hex');
const contents = `DATABASE_URL=mysql://gyeol:${password}@127.0.0.1:3306/gyeol\nMYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${randomBytes(24).toString('hex')}\nJWT_SECRET=${randomBytes(48).toString('hex')}\nPORT=4000\nWEB_ORIGIN=http://localhost:3000\nCATALOG_MODE=live\nAPPLE_COUNTRY=US\nNODE_ENV=development\n`;
try {
  await writeFile('.env', contents, { flag: 'wx', mode: 0o600 });
  console.log('Created local .env with random development credentials. Values were not printed.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('Existing .env preserved.');
  else throw error;
}
