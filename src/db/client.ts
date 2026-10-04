import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

// One pool per process; survives Next.js dev hot reloads via globalThis.
const g = globalThis as unknown as { __khSql?: postgres.Sql; __khDb?: Database };

export function sqlClient(): postgres.Sql {
  g.__khSql ??= postgres(env().DATABASE_URL, { max: 10, idle_timeout: 30, prepare: true });
  return g.__khSql;
}

export function db(): Database {
  g.__khDb ??= drizzle(sqlClient(), { schema });
  return g.__khDb;
}

export { withTenant, type TenantContext } from './tenant';

export async function pingDatabase(): Promise<void> {
  await db().execute(sql`select 1`);
}
