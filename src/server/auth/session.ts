import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { codes, plans, sessions, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken, sha256 } from '@/lib/crypto';

// SECURITY.md §2: httpOnly + Secure + SameSite=Lax cookie, 30 days with
// "Lembrar-me", 12 h without; token rotated on every login; only its
// SHA-256 is stored, so a database leak doesn't leak sessions.
export const SESSION_COOKIE = 'kh_session';
const REMEMBER_MS = 30 * 24 * 3600 * 1000;
const SHORT_MS = 12 * 3600 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type AccessProblem =
  | 'unverified'
  | 'user_paused'
  | 'user_disabled'
  | 'tenant_deleted'
  | 'tenant_canceled'
  | 'code_paused'
  | 'code_revoked';

export type AuthContext = {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    lang: 'pt' | 'en';
    roleInTenant: 'admin' | 'member';
    totpEnabled: boolean;
  };
  tenant: {
    id: string;
    name: string;
    kind: 'pack' | 'individual';
    status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';
    planId: string | null;
    planCode: string | null;
    seats: number;
    trialEndsAt: Date | null;
    renewAt: Date | null;
  };
  reauthAt: Date;
};

export function cookieOptions(remember: boolean) {
  const e = env();
  return {
    httpOnly: true,
    secure: e.APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: e.NEXT_PUBLIC_BASE_PATH || '/',
    maxAge: Math.floor((remember ? REMEMBER_MS : SHORT_MS) / 1000),
  };
}

export async function createSession(
  userId: string,
  opts: { remember: boolean; ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + (opts.remember ? REMEMBER_MS : SHORT_MS));
  const [row] = await db()
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      remember: opts.remember,
      expiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 400) ?? null,
    })
    .returning({ id: sessions.id });
  await db().update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
  return { token, sessionId: row!.id, expiresAt };
}

/** Why a (verified-password) user may not use the app right now, if anything. */
export function accessProblem(row: {
  emailVerifiedAt: Date | null;
  userStatus: string;
  tenantDeletedAt: Date | null;
  tenantStatus: string;
  codeStatus: string | null;
}): AccessProblem | null {
  if (row.userStatus === 'disabled') return 'user_disabled';
  if (row.userStatus === 'paused') return 'user_paused';
  // The code is the more specific cause (a revoked license also marks its tenant deleted).
  if (row.codeStatus === 'revoked') return 'code_revoked';
  if (row.codeStatus === 'paused') return 'code_paused';
  if (row.tenantDeletedAt) return 'tenant_deleted';
  if (row.tenantStatus === 'canceled') return 'tenant_canceled';
  if (!row.emailVerifiedAt) return 'unverified';
  return null;
}

export async function resolveSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const now = new Date();
  const [row] = await db()
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      reauthAt: sessions.reauthAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      lang: users.lang,
      roleInTenant: users.roleInTenant,
      userStatus: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabledAt: users.totpEnabledAt,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantKind: tenants.kind,
      tenantStatus: tenants.status,
      tenantDeletedAt: tenants.deletedAt,
      planId: tenants.planId,
      planCode: plans.code,
      seats: tenants.seats,
      trialEndsAt: tenants.trialEndsAt,
      renewAt: tenants.renewAt,
      codeStatus: codes.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .leftJoin(codes, eq(codes.id, users.registeredWithCodeId))
    .where(
      and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
    )
    .limit(1);
  if (!row || accessProblem(row)) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db().update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
    await db().update(users).set({ lastSeenAt: now }).where(eq(users.id, row.userId));
  }

  return {
    sessionId: row.sessionId,
    reauthAt: row.reauthAt,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      lang: row.lang,
      roleInTenant: row.roleInTenant,
      totpEnabled: Boolean(row.totpEnabledAt),
    },
    tenant: {
      id: row.tenantId,
      name: row.tenantName,
      kind: row.tenantKind,
      status: row.tenantStatus,
      planId: row.planId,
      planCode: row.planCode,
      seats: row.seats,
      trialEndsAt: row.trialEndsAt,
      renewAt: row.renewAt,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Ends every session of a user (password reset, account paused…), optionally keeping one. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const rows = await db()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : sql`true`,
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

export async function markReauthenticated(sessionId: string): Promise<void> {
  await db().update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId));
}
