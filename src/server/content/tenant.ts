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

/**
 * Like asUser, with the share scope on: the caller also reaches the notes,
 * tasks and artifacts of the shared folders they belong to (read or edit, by
 * RLS). Only for single-item reads/writes and explicit shared-folder lists.
 */
export function asSharer<T>(
  auth: AuthContext,
  fn: (tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]) => Promise<T>,
) {
  return withTenant(db(), { tenantId: auth.tenant.id, userId: auth.user.id, share: true }, fn);
}

export type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
