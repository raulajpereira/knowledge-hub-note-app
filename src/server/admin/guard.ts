import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { requireAuth } from '@/server/auth/request';
import type { AuthContext } from '@/server/auth/session';

// Admin Console roles (prototype AROLE + decision D46), always checked here on
// the server — the console only hides what a role can't use.
export type AdminRole = 'owner' | 'admin' | 'billing' | 'support' | 'readonly';
export type AdminArea =
  'overview' | 'clients' | 'users' | 'codes' | 'plans' | 'requests' | 'admins' | 'audit';

const ALL: AdminArea[] = ['overview', 'clients', 'users', 'codes', 'plans', 'requests', 'admins', 'audit'];
const NO_ADMINS = ALL.filter((a) => a !== 'admins');

/** What each role can see / change. */
export const ROLE_ACCESS: Record<AdminRole, { read: AdminArea[]; write: AdminArea[] }> = {
  // Manager: everything, including the console's administrators
  owner: { read: ALL, write: ALL },
  admin: { read: NO_ADMINS, write: NO_ADMINS },
  // clients, licenses, codes and plans (and the plan requests they lead to)
  billing: {
    read: ['overview', 'clients', 'users', 'codes', 'plans', 'requests'],
    write: ['overview', 'clients', 'codes', 'plans', 'requests'],
  },
  // users, requests and audit; clients' commercial data read-only (D46)
  support: {
    read: ['overview', 'clients', 'users', 'codes', 'requests', 'audit'],
    write: ['users', 'requests'],
  },
  readonly: { read: NO_ADMINS, write: [] },
};

export type AdminCtx = AuthContext & { admin: { role: AdminRole } };

/** The console's admin of this session (active, with 2FA), or null. */
export async function adminOf(auth: AuthContext): Promise<{ role: AdminRole } | null> {
  const [a] = await db()
    .select({ role: admins.role, status: admins.status })
    .from(admins)
    .where(eq(admins.userId, auth.user.id))
    .limit(1);
  return a && a.status === 'active' ? { role: a.role } : null;
}

/**
 * Session + active console admin + 2FA (SECURITY.md: mandatory for console
 * admins) + the role's access to the area. Any non-admin gets a plain 404.
 */
export async function requireAdmin(area: AdminArea, write = false): Promise<AdminCtx> {
  return checkAdmin(await requireAuth(), area, write);
}

/** The checks of requireAdmin for a resolved session. */
export async function checkAdmin(auth: AuthContext, area: AdminArea, write = false): Promise<AdminCtx> {
  const admin = await adminOf(auth);
  if (!admin) throw new ApiError(404, 'not_found');
  if (!auth.user.totpEnabled) throw new ApiError(403, 'admin_2fa_required');
  const acc = ROLE_ACCESS[admin.role];
  if (!(write ? acc.write : acc.read).includes(area)) throw new ApiError(403, 'forbidden');
  return { ...auth, admin };
}
