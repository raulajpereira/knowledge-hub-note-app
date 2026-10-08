import 'server-only';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, tenants, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { revokeAllSessions } from '@/server/auth/session';
import { sendResetLink, sendVerification } from '@/server/auth/service';
import type { AdminCtx } from './guard';

// The console's user page: edit, disable / reactivate, pause, send a password
// reset, resend the confirmation email, delete. Console admins can't be
// changed from here (Administradores manages them), nor can anyone change
// their own account.

async function loadUser(id: string) {
  const [u] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new ApiError(404, 'not_found');
  return u;
}

async function guardTarget(ctx: AdminCtx, u: typeof users.$inferSelect) {
  if (u.id === ctx.user.id) throw new ApiError(403, 'forbidden');
  const [a] = await db().select({ role: admins.role }).from(admins).where(eq(admins.userId, u.id)).limit(1);
  if (a?.role === 'owner') throw new ApiError(403, 'forbidden');
}

const log = (
  ctx: AdminCtx,
  u: { id: string; email: string; tenantId: string },
  action: string,
  ip: string | null,
  details: Record<string, unknown> = {},
) =>
  audit({
    action,
    actorUserId: ctx.user.id,
    tenantId: u.tenantId,
    targetType: 'user',
    targetId: u.id,
    details: { email: u.email, ...details },
    ip,
  });

export type UserPatch = Partial<{
  name: string;
  email: string;
  role: 'admin' | 'member';
  status: 'active' | 'paused' | 'disabled';
}>;

export async function updateUser(ctx: AdminCtx, id: string, patch: UserPatch, ip: string | null) {
  const u = await loadUser(id);
  await guardTarget(ctx, u);
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.email !== undefined && patch.email.toLowerCase() !== u.email.toLowerCase()) {
    const email = patch.email.toLowerCase();
    const [taken] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) throw new ApiError(409, 'email_taken');
    // a new address has to be confirmed again
    set.email = email;
    set.emailVerifiedAt = null;
  }
  if (patch.role !== undefined) set.roleInTenant = patch.role;
  if (patch.status !== undefined) set.status = patch.status;
  if (!Object.keys(set).length) return;
  await db().update(users).set(set).where(eq(users.id, id));
  if (set.status && set.status !== 'active') await revokeAllSessions(id);
  if (set.email) {
    await revokeAllSessions(id);
    await sendVerification(id, set.email, u.lang);
  }
  const action =
    patch.status === 'disabled'
      ? 'user.disable'
      : patch.status === 'paused'
        ? 'user.pause'
        : patch.status === 'active' && u.status !== 'active'
          ? 'user.enable'
          : 'user.update';
  await log(ctx, { ...u, email: set.email ?? u.email }, action, ip, { ...patch });
}

/**
 * Ficheiros: quota and largest file for one person (null = the defaults). Unlike
 * the rest of the page, an admin may raise their own; only the owner changes the owner's.
 */
export async function setFileLimits(
  ctx: AdminCtx,
  id: string,
  limits: { filesQuotaMb: number | null; filesMaxMb: number | null },
  ip: string | null,
) {
  const u = await loadUser(id);
  if (u.id !== ctx.user.id) {
    const [a] = await db().select({ role: admins.role }).from(admins).where(eq(admins.userId, u.id)).limit(1);
    if (a?.role === 'owner') throw new ApiError(403, 'forbidden');
  }
  await db()
    .update(users)
    .set({ filesQuotaMb: limits.filesQuotaMb, filesMaxMb: limits.filesMaxMb })
    .where(eq(users.id, id));
  await log(ctx, u, 'user.files_limits', ip, limits);
}

/** "Repor password": the reset link by email (the console never sees or sets passwords). */
export async function sendUserReset(ctx: AdminCtx, id: string, ip: string | null) {
  const u = await loadUser(id);
  await guardTarget(ctx, u);
  if (u.status === 'disabled') throw new ApiError(409, 'user_disabled');
  await sendResetLink(u.id, u.email, u.lang);
  await log(ctx, u, 'user.reset_sent', ip);
}

/** "Reenviar convite": the confirmation email again, for someone who never confirmed it. */
export async function resendInvite(ctx: AdminCtx, id: string, ip: string | null) {
  const u = await loadUser(id);
  await guardTarget(ctx, u);
  if (u.emailVerifiedAt) throw new ApiError(409, 'already_verified');
  await sendVerification(u.id, u.email, u.lang);
  await log(ctx, u, 'user.invite_resent', ip);
}

/**
 * "Eliminar utilizador": the account and all its data, for good. The last
 * person of an individual client takes the client with them (prototype).
 */
export async function deleteUser(ctx: AdminCtx, id: string, ip: string | null) {
  const u = await loadUser(id);
  await guardTarget(ctx, u);
  const [t] = await db().select().from(tenants).where(eq(tenants.id, u.tenantId)).limit(1);
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, u.tenantId), ne(users.id, id)))) as [{ n: number }];
  await db().transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, id));
    if (t && t.kind === 'individual' && n === 0) await tx.delete(tenants).where(eq(tenants.id, t.id));
  });
  await log(ctx, u, 'user.delete', ip, {
    name: u.name,
    client: t?.name,
    clientDeleted: t?.kind === 'individual' && n === 0,
  });
}
