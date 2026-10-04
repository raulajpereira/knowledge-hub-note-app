import { defineConfig } from 'drizzle-kit';

// Migrations run as the schema owner (DATABASE_ADMIN_URL); the app itself
// connects as the unprivileged kh_app role so Row Level Security applies.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || '' },
  strict: true,
  verbose: true,
});
