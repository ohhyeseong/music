import { defineConfig } from 'prisma/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createConnection } from 'mysql2/promise';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

// Prisma 6's official JS schema engine avoids downloading native engines.
// MariaDB's adapter has no executeScript yet; use mysql2 only for trusted migration SQL.
async function connect(url: string) {
  const adapter = await new PrismaMariaDb(url, {
    database: new URL(url).pathname.slice(1),
  }).connect();
  adapter.executeScript = async (sql: string) => {
    const parsed = new URL(url);
    const connection = await createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      multipleStatements: true,
    });
    try {
      await connection.query(sql);
    } finally {
      await connection.end();
    }
  };
  return adapter;
}
export default defineConfig({
  schema: 'apps/api/prisma/schema.prisma',
  migrations: { path: 'apps/api/prisma/migrations' },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () => ({
    provider: 'mysql',
    adapterName: 'gyeol-mysql-migration',
    connect: () => connect(process.env.DATABASE_URL!),
    connectToShadowDb: () => {
      const url = process.env.SHADOW_DATABASE_URL;
      if (!url || !new URL(url).pathname.endsWith('_shadow'))
        throw new Error('A separate *_shadow database is required for development migrations.');
      return connect(url);
    },
  }),
});
