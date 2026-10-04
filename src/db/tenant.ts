import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type TenantContext = { tenantId: string; userId?: string | null };

// Every tenant-scoped query runs inside this: a transaction whose
// app.tenant_id / app.user_id settings (transaction-local, so they can never
// leak to the next request on a pooled connection) drive the RLS policies.
export async function withTenant<TDb extends PgDatabase<PgQueryResultHKT, Record<string, unknown>>, T>(
  database: TDb,
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<TDb['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(ctx.tenantId)) throw new Error('withTenant: invalid tenantId');
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`,
    );
    return fn(tx as Parameters<Parameters<TDb['transaction']>[0]>[0]);
  });
}
