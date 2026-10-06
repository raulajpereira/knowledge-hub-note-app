import 'server-only';
import { db } from '@/db/client';
import { withTenant } from '@/db/tenant';
import type { AuthContext } from '@/server/auth/session';

/** Runs `fn` in a transaction scoped by RLS to the caller's tenant and user. */
export function asUser<T>(
  auth: AuthContext,
  fn: (tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]) => Promise<T>,
) {
  return withTenant(db(), { tenantId: auth.tenant.id, userId: auth.user.id }, fn);
}

export type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
