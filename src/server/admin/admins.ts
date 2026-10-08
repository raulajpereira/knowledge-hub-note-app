import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import type { AdminCtx, AdminRole } from './guard';

// Administradores (Manager only): who can open the console and with which
// role. The person needs a KnowledgeHub account with the same email; the
// Manager (owner) row can't be changed from here.

export type AdminRow = {
  userId: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'paused';
  totp: boolean;
  since: string;
};

export async function listAdmins(): Promise<AdminRow[]> {
  const rows = await db()
    .select({
      userId: admins.userId,
      name: users.name,
      email: users.email,
      role: admins.role,
      status: admins.status,
      totp: users.totpEnabledAt,
      since: admins.createdAt,
    })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .orderBy(asc(admins.createdAt));
  return rows.map((r) => ({ ...r, totp: !!r.totp, since: r.since.toISOString() }));
}

const ASSIGNABLE = ['admin', 'billing', 'support', 'readonly'] as const;
type Assignable = (typeof ASSIGNABLE)[number];

const log = (ctx: AdminCtx, action: string, target: { userId: string; email: string }, details = {}) =>
  audit({
    action,
    actorUserId: ctx.user.id,
    targetType: 'user',
    targetId: target.userId,
    details: { email: target.email, ...details },
  });

/** "Dar acesso": an existing account by email (never the owner role). */
export async function grantAdmin(ctx: AdminCtx, emailRaw: string, role: Assignable) {
  const email = emailRaw.trim().toLowerCase();
  const [u] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new ApiError(404, 'no_account');
  const [cur] = await db().select().from(admins).where(eq(admins.userId, u.id)).limit(1);
  if (cur) throw new ApiError(409, 'already_admin');
  await db().insert(admins).values({ userId: u.id, role });
  await log(ctx, 'admin.grant', { userId: u.id, email }, { role });
}

async function loadOther(ctx: AdminCtx, userId: string) {
  const [a] = await db()
    .select({ role: admins.role, status: admins.status, email: users.email })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .where(eq(admins.userId, userId))
    .limit(1);
  if (!a) throw new ApiError(404, 'not_found');
  if (a.role === 'owner' || userId === ctx.user.id) throw new ApiError(403, 'forbidden');
  return a;
}

export async function updateAdmin(
  ctx: AdminCtx,
  userId: string,
  patch: { role?: Assignable; status?: 'active' | 'paused' },
) {
  const a = await loadOther(ctx, userId);
  await db().update(admins).set(patch).where(eq(admins.userId, userId));
  if (patch.role && patch.role !== a.role)
    await log(ctx, 'admin.role', { userId, email: a.email }, { from: a.role, role: patch.role });
  if (patch.status && patch.status !== a.status)
    await log(ctx, patch.status === 'paused' ? 'admin.pause' : 'admin.resume', { userId, email: a.email });
}

export async function removeAdmin(ctx: AdminCtx, userId: string) {
  const a = await loadOther(ctx, userId);
  await db().delete(admins).where(eq(admins.userId, userId));
  await log(ctx, 'admin.remove', { userId, email: a.email }, { role: a.role });
}

export { ASSIGNABLE };
