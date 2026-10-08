import 'server-only';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
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

/** ADMIN_IP_ALLOWLIST (IPs or IPv4 CIDRs); empty = any address. */
export function ipAllowed(ip: string | null, list = env().ADMIN_IP_ALLOWLIST ?? '') {
  const rules = list
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!rules.length) return true;
  if (!ip) return false;
  const v4 = (s: string) => {
    const p = s.replace(/^::ffff:/i, '').split('.');
    if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
    return p.reduce((n, x) => n * 256 + Number(x), 0);
  };
  return rules.some((r) => {
    const [base, bits] = r.split('/');
    if (bits === undefined) return base!.toLowerCase() === ip.replace(/^::ffff:/i, '').toLowerCase();
    const b = v4(base!);
    const a = v4(ip);
    const n = Number(bits);
    if (b === null || a === null || !(n >= 0 && n <= 32)) return false;
    return Math.floor(a / 2 ** (32 - n)) === Math.floor(b / 2 ** (32 - n));
  });
}

async function requestIp() {
  try {
    const h = await headers();
    const ip = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim();
    return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
  } catch {
    return null; // outside a request (CLI, tests)
  }
}

/** The console's admin of this session (active, from an allowed IP), or null. */
export async function adminOf(auth: AuthContext): Promise<{ role: AdminRole } | null> {
  if (env().ADMIN_IP_ALLOWLIST && !ipAllowed(await requestIp())) return null;
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
