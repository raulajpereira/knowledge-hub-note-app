// Applies drizzle/ migrations as the schema owner. Run before `up` on deploy
// (bundled to dist/migrate.mjs in the worker image) and via `npm run db:migrate`.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL (or DATABASE_URL) is required');
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: process.env.MIGRATIONS_DIR || './drizzle' });
  console.log('Migrations applied');
} finally {
  await client.end();
}
