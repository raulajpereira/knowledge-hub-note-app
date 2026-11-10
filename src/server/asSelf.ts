import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * A transaction as the user only (app.user_id set, no tenant): for the
 * per-person tables outside the tenant data (user_prefs, user_assets), whose
 * RLS lets a row be seen or changed only by its owner (migration 0059).
 */
export function asSelf<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
