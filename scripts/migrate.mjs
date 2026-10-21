import { createConnection } from 'mysql2/promise';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const url = new URL(process.env.DATABASE_URL);
const connection = await createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  multipleStatements: true,
});
try {
  const [locks] = await connection.query(
    "SELECT GET_LOCK('gyeol_schema_migration', 15) AS acquired",
  );
  if (locks[0].acquired !== 1) throw new Error('Could not acquire migration lock');
  await connection.query(
    'CREATE TABLE IF NOT EXISTS `_gyeol_migrations` (`name` VARCHAR(150) PRIMARY KEY, `checksum` CHAR(64) NOT NULL, `finishedAt` DATETIME(3) NULL)',
  );
  const base = new URL('../apps/api/prisma/migrations/', import.meta.url);
  for (const name of (await readdir(base)).sort()) {
    const sql = await readFile(new URL(`${name}/migration.sql`, base), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [rows] = await connection.execute(
      'SELECT checksum, finishedAt FROM `_gyeol_migrations` WHERE name=?',
      [name],
    );
    if (rows.length) {
      if (rows[0].checksum !== checksum || !rows[0].finishedAt)
        throw new Error(
          `Migration ${name} changed or is incomplete. Restore/repair the database before continuing.`,
        );
      console.log(`Unchanged: ${name}`);
      continue;
    }
    await connection.execute('INSERT INTO `_gyeol_migrations` (name,checksum) VALUES (?,?)', [
      name,
      checksum,
    ]);
    await connection.query(sql);
    await connection.execute('UPDATE `_gyeol_migrations` SET finishedAt=NOW(3) WHERE name=?', [
      name,
    ]);
    console.log(`Applied: ${name}`);
  }
} finally {
  await connection.query("SELECT RELEASE_LOCK('gyeol_schema_migration')").catch(() => {});
  await connection.end();
}
