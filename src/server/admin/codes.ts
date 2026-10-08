import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { codes, plans, tenants, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { createCode, REVOKE_RETENTION_DAYS } from '@/server/licensing/codes';
import type { AdminCtx } from './guard';

// Códigos (Admin Console): KH-INV / KH-LIC codes with their holder, usage and
// validity. "expired" is derived (an active code past its date); revoked codes
// stay listed while they can still be restored (D45).

const DAY = 86_400_000;

export type CodeRow = {
  id: string;
  code: string;
  type: 'invite' | 'license';
  status: 'active' | 'paused' | 'revoked' | 'expired';
  plan: { code: string; color: string | null } | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  /** last day a revoked code can be restored */
  restoreUntil: string | null;
  createdAt: string;
  holder:
    | { kind: 'pack' | 'individual'; tenantId: string; name: string; seats: number }
    | { kind: 'user'; tenantId: string; name: string; email: string }
    | null;
};

const statusOf = (c: typeof codes.$inferSelect): CodeRow['status'] =>
  c.status === 'active' && c.expiresAt && c.expiresAt.getTime() < Date.now() ? 'expired' : c.status;

export async function listCodes(): Promise<CodeRow[]> {
  const rows = await db().select().from(codes).orderBy(desc(codes.createdAt));
  const now = Date.now();
  const live = rows.filter(
    (c) =>
      c.status !== 'revoked' || (c.revokedAt && now - c.revokedAt.getTime() < REVOKE_RETENTION_DAYS * DAY),
  );
  const [planRows, tenantRows, holders] = await Promise.all([
    db().select({ id: plans.id, code: plans.code, color: plans.color }).from(plans),
    db()
      .select({ id: tenants.id, name: tenants.name, kind: tenants.kind, seats: tenants.seats })
      .from(tenants),
    live.length
      ? db()
          .select({
            codeId: users.registeredWithCodeId,
            name: users.name,
            email: users.email,
            tenantId: users.tenantId,
          })
          .from(users)
          .where(
            inArray(
              users.registeredWithCodeId,
              live.map((c) => c.id),
            ),
          )
      : [],
  ]);
  return live.map((c) => {
    const t = c.tenantId ? tenantRows.find((x) => x.id === c.tenantId) : undefined;
    const u = holders.find((h) => h.codeId === c.id);
    const p = planRows.find((x) => x.id === c.planId);
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      status: statusOf(c),
      plan: p ? { code: p.code, color: p.color } : null,
      maxUses: c.maxUses,
      uses: c.uses,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      revokedAt: c.revokedAt?.toISOString() ?? null,
      restoreUntil: c.revokedAt
        ? new Date(c.revokedAt.getTime() + REVOKE_RETENTION_DAYS * DAY).toISOString()
        : null,
      createdAt: c.createdAt.toISOString(),
      holder: t
        ? { kind: t.kind, tenantId: t.id, name: t.name, seats: t.seats }
        : u
          ? { kind: 'user', tenantId: u.tenantId, name: u.name, email: u.email }
          : null,
    };
  });
}

/** The people who registered with a code ("Utilizado por"). */
export async function codeUsers(code: string) {
  const [c] = await db().select({ id: codes.id }).from(codes).where(eq(codes.code, code)).limit(1);
  if (!c) throw new ApiError(404, 'code_not_found');
  return db()
    .select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.registeredWithCodeId, c.id))
    .orderBy(users.createdAt);
}

/** "Gerar código": type, holder (a pack, or whoever registers), plan, uses and validity. */
export async function generateCode(
  ctx: AdminCtx,
  input: {
    type: 'invite' | 'license';
    tenantId?: string | null;
    plan: string;
    maxUses: number;
    lifetime: boolean;
    days?: number;
  },
) {
  if (input.plan === 'CUSTOM') throw new ApiError(400, 'invalid_input');
  const [p] = await db().select({ id: plans.id }).from(plans).where(eq(plans.code, input.plan)).limit(1);
  if (!p) throw new ApiError(400, 'invalid_input');
  if (input.tenantId) {
    const [t] = await db()
      .select({ id: tenants.id, deletedAt: tenants.deletedAt })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .limit(1);
    if (!t || t.deletedAt) throw new ApiError(404, 'not_found');
  }
  return createCode({
    type: input.type,
    planCode: input.plan,
    maxUses: input.maxUses,
    expiresAt: input.lifetime ? null : new Date(Date.now() + (input.days ?? 30) * DAY),
    tenantId: input.tenantId ?? null,
    createdBy: ctx.user.id,
  });
}

async function findCode(code: string) {
  const [c] = await db().select().from(codes).where(eq(codes.code, code)).limit(1);
  if (!c) throw new ApiError(404, 'code_not_found');
  return c;
}

/** "Guardar": number of users (never below the uses) and validity (a date, or lifetime). */
export async function editCode(
  ctx: AdminCtx,
  code: string,
  patch: { maxUses: number; expiresAt: string | null },
) {
  const c = await findCode(code);
  if (c.status === 'revoked') throw new ApiError(409, 'code_already_revoked');
  const maxUses = Math.max(c.uses, patch.maxUses, 1);
  const expiresAt = patch.expiresAt ? new Date(`${patch.expiresAt}T23:59:59Z`) : null;
  await db()
    .update(codes)
    .set({
      maxUses,
      expiresAt,
      ...(c.status === 'expired' && (!expiresAt || expiresAt.getTime() > Date.now())
        ? { status: 'active' as const }
        : {}),
    })
    .where(eq(codes.id, c.id));
  await audit({
    action: 'code.edit',
    actorUserId: ctx.user.id,
    tenantId: c.tenantId,
    targetType: 'code',
    targetId: code,
    details: { maxUses, expiresAt: patch.expiresAt },
  });
}

/** "+30 dias": from today or from the current date, whichever is later; an expired code is active again. */
export async function extendCode(ctx: AdminCtx, code: string) {
  const c = await findCode(code);
  if (c.status === 'revoked') throw new ApiError(409, 'code_already_revoked');
  if (!c.expiresAt) throw new ApiError(409, 'code_lifetime');
  const expiresAt = new Date(Math.max(Date.now(), c.expiresAt.getTime()) + 30 * DAY);
  await db()
    .update(codes)
    .set({ expiresAt, ...(c.status === 'expired' ? { status: 'active' as const } : {}) })
    .where(eq(codes.id, c.id));
  await audit({
    action: 'code.extend',
    actorUserId: ctx.user.id,
    tenantId: c.tenantId,
    targetType: 'code',
    targetId: code,
    details: { expiresAt: expiresAt.toISOString().slice(0, 10) },
  });
}
