import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db, type Database } from '@/db/client';
import { codes, plans, sessions, tenants, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { invalidateEntitlements } from './entitlements';
import { randomCode, type CodeType } from './codeFormat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any> | Database;

export const REVOKE_RETENTION_DAYS = 30;

export type CodeProblem = 'code_invalid' | 'code_paused' | 'code_expired' | 'code_used_up' | 'code_no_seats';

export type Redemption = {
  tenantId: string;
  role: 'admin' | 'member';
  codeId: string;
  createdTenant: boolean;
};

async function planIdByCode(tx: Tx, code: string): Promise<string> {
  const [p] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, code)).limit(1);
  if (!p) throw new Error(`Plan ${code} missing — run the seed`);
  return p.id;
}

async function seatsLeft(tx: Tx, tenantId: string): Promise<number> {
  const [t] = await tx
    .select({ seats: tenants.seats, deletedAt: tenants.deletedAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for('update');
  if (!t || t.deletedAt) return 0;
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.status, ['active', 'invited', 'paused'])));
  return t.seats - n;
}

/**
 * Validates and consumes a code inside the registration transaction
 * (SECURITY.md §2: SELECT … FOR UPDATE, checks status / expiry / uses).
 *  - KH-LIC: first use creates the client's tenant with the code's plan and
 *    seats (the registrant becomes its admin); later uses join it.
 *  - KH-INV with a tenant: joins that tenant as a member.
 *  - KH-INV without a tenant: creates an individual tenant (code's plan, FREE by default).
 */
export async function redeemCode(tx: Tx, codeStr: string, registrant: { name: string }): Promise<Redemption> {
  const [c] = await tx.select().from(codes).where(eq(codes.code, codeStr)).for('update');
  if (!c || c.status === 'revoked') throw new ApiError(400, 'code_invalid');
  if (c.status === 'paused') throw new ApiError(400, 'code_paused');
  if (c.status === 'expired' || (c.expiresAt && c.expiresAt.getTime() <= Date.now()))
    throw new ApiError(400, 'code_expired');
  if (c.uses >= c.maxUses) throw new ApiError(400, 'code_used_up');

  let tenantId = c.tenantId;
  let role: 'admin' | 'member' = 'member';
  let createdTenant = false;

  if (tenantId) {
    if ((await seatsLeft(tx, tenantId)) <= 0) throw new ApiError(400, 'code_no_seats');
  } else {
    const planId = c.planId ?? (await planIdByCode(tx, 'FREE'));
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    const isLicense = c.type === 'license';
    const [t] = await tx
      .insert(tenants)
      .values({
        name: c.clientName || registrant.name,
        kind: isLicense && c.maxUses > 1 ? 'pack' : 'individual',
        planId,
        seats: isLicense ? c.maxUses : 1,
        status: plan?.trialEnabled ? 'trial' : 'active',
        trialEndsAt: plan?.trialEnabled ? new Date(Date.now() + plan.trialDays * 86400_000) : null,
        renewAt: c.expiresAt,
      })
      .returning({ id: tenants.id });
    tenantId = t!.id;
    role = 'admin';
    createdTenant = true;
    // A license keeps pointing at the tenant it created, so the next seats join it.
    if (isLicense) await tx.update(codes).set({ tenantId }).where(eq(codes.id, c.id));
  }

  await tx
    .update(codes)
    .set({ uses: sql`${codes.uses} + 1` })
    .where(eq(codes.id, c.id));
  return { tenantId: tenantId!, role, codeId: c.id, createdTenant };
}

export type NewCode = {
  type: CodeType;
  planCode?: string;
  maxUses?: number;
  expiresAt?: Date | null;
  tenantId?: string | null;
  clientName?: string | null;
  createdBy?: string | null;
};

/** Generates a unique KH-LIC-/KH-INV-###### code (Admin Console › Códigos; CLI until then). */
export async function createCode(input: NewCode) {
  const planId = input.planCode ? await planIdByCode(db(), input.planCode) : null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode(input.type);
    const rows = await db()
      .insert(codes)
      .values({
        code,
        type: input.type,
        planId,
        maxUses: input.maxUses ?? 1,
        expiresAt: input.expiresAt ?? null,
        tenantId: input.tenantId ?? null,
        clientName: input.clientName ?? null,
        createdBy: input.createdBy ?? null,
      })
      .onConflictDoNothing({ target: codes.code })
      .returning();
    if (rows[0]) {
      await audit({
        action: 'code.create',
        actorUserId: input.createdBy,
        targetType: 'code',
        targetId: code,
        details: { type: input.type, plan: input.planCode, maxUses: rows[0].maxUses },
      });
      return rows[0];
    }
  }
  throw new Error('Could not generate a unique code');
}

async function affectedUserIds(codeId: string): Promise<string[]> {
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.registeredWithCodeId, codeId));
  return rows.map((r) => r.id);
}

async function endSessions(userIds: string[]) {
  if (!userIds.length) return;
  await db()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(inArray(sessions.userId, userIds), isNull(sessions.revokedAt)));
}

async function findCode(code: string) {
  const [c] = await db().select().from(codes).where(eq(codes.code, code)).limit(1);
  if (!c) throw new ApiError(404, 'code_not_found');
  return c;
}

/** Pause: users of the code lose access at once; data untouched. */
export async function pauseCode(code: string, actorUserId?: string | null) {
  const c = await findCode(code);
  if (c.status !== 'active') throw new ApiError(409, 'code_not_active');
  await db().update(codes).set({ status: 'paused' }).where(eq(codes.id, c.id));
  await endSessions(await affectedUserIds(c.id));
  if (c.tenantId) await invalidateEntitlements(c.tenantId);
  await audit({ action: 'code.pause', actorUserId, targetType: 'code', targetId: code });
}

export async function resumeCode(code: string, actorUserId?: string | null) {
  const c = await findCode(code);
  if (c.status !== 'paused') throw new ApiError(409, 'code_not_paused');
  await db().update(codes).set({ status: 'active' }).where(eq(codes.id, c.id));
  await audit({ action: 'code.resume', actorUserId, targetType: 'code', targetId: code });
}

/**
 * Revoke (DECISIONS §1): access cut immediately; the tenant a license created
 * is marked deleted_at = now and kept 30 days (restorable), then purged by
 * the daily job.
 */
export async function revokeCode(code: string, actorUserId?: string | null) {
  const c = await findCode(code);
  if (c.status === 'revoked') throw new ApiError(409, 'code_already_revoked');
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(codes).set({ status: 'revoked', revokedAt: now }).where(eq(codes.id, c.id));
    if (c.type === 'license' && c.tenantId) {
      await tx.update(tenants).set({ deletedAt: now }).where(eq(tenants.id, c.tenantId));
    }
  });
  await endSessions(await affectedUserIds(c.id));
  if (c.tenantId) await invalidateEntitlements(c.tenantId);
  await audit({
    action: 'code.revoke',
    actorUserId,
    targetType: 'code',
    targetId: code,
    details: { tenantId: c.tenantId },
  });
}

/** Undo a revocation within the retention window. */
export async function restoreCode(code: string, actorUserId?: string | null) {
  const c = await findCode(code);
  if (c.status !== 'revoked' || !c.revokedAt) throw new ApiError(409, 'code_not_revoked');
  if (Date.now() - c.revokedAt.getTime() > REVOKE_RETENTION_DAYS * 86400_000)
    throw new ApiError(410, 'retention_expired');
  await db().transaction(async (tx) => {
    await tx.update(codes).set({ status: 'active', revokedAt: null }).where(eq(codes.id, c.id));
    if (c.type === 'license' && c.tenantId) {
      await tx.update(tenants).set({ deletedAt: null }).where(eq(tenants.id, c.tenantId));
    }
  });
  if (c.tenantId) await invalidateEntitlements(c.tenantId);
  await audit({ action: 'code.restore', actorUserId, targetType: 'code', targetId: code });
}
