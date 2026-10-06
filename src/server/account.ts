import 'server-only';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, tenants, users } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/server/auth/password';
import { Lockout } from '@/server/auth/rateLimit';
import { revokeAllSessions, revokeSession, type AuthContext } from '@/server/auth/session';
import type { RequestMeta } from '@/server/auth/service';
import type { Lang } from '@/i18n';
import { getPrefs } from './prefs';

// Account & data (prototype "Conta e Dados" modal): profile, password,
// sessions, export. 2FA lives in the auth service.

const pwLock = new Lockout('pwchange');

export async function updateProfile(auth: AuthContext, input: { name?: string; lang?: Lang }) {
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.lang !== undefined) set.lang = input.lang;
  if (!Object.keys(set).length) return;
  await db().update(users).set(set).where(eq(users.id, auth.user.id));
  if (input.name !== undefined)
    await audit({ action: 'account.profile_updated', actorUserId: auth.user.id, tenantId: auth.tenant.id });
}

/** Changes the password from inside the app; other sessions end, this one stays. */
export async function changePassword(
  auth: AuthContext,
  input: { current: string; next: string },
  meta: RequestMeta,
): Promise<void> {
  const wait = await pwLock.lockedFor(auth.user.id);
  if (wait) throw new ApiError(429, 'locked', undefined, { retryAfter: wait });
  const [u] = await db().select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!u || !(await verifyPassword(u.passwordHash, input.current))) {
    const locked = await pwLock.fail(auth.user.id);
    if (locked) throw new ApiError(429, 'locked', undefined, { retryAfter: locked });
    throw new ApiError(401, 'bad_credentials');
  }
  await pwLock.success(auth.user.id);
  if (input.current === input.next) throw new ApiError(400, 'password_same');
  const problem = await checkPasswordPolicy(input.next);
  if (problem) throw new ApiError(400, `password_${problem}`);
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(input.next), passwordChangedAt: new Date() })
    .where(eq(users.id, u.id));
  const ended = await revokeAllSessions(u.id, auth.sessionId);
  await sendMail(renderMail('changed', u.lang, u.email));
  await audit({
    action: 'account.password_changed',
    actorUserId: u.id,
    tenantId: u.tenantId,
    ip: meta.ip,
    details: { sessionsEnded: ended },
  });
}

export type SessionInfo = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export async function listSessions(auth: AuthContext): Promise<SessionInfo[]> {
  const rows = await db()
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.userId, auth.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    )
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
  return rows
    .map((s) => ({
      id: s.id,
      current: s.id === auth.sessionId,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export async function endSession(auth: AuthContext, sessionId: string): Promise<void> {
  if (sessionId === auth.sessionId) throw new ApiError(400, 'current_session');
  const [s] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.user.id)))
    .limit(1);
  if (!s) throw new ApiError(404, 'not_found');
  await revokeSession(s.id);
  await audit({ action: 'account.session_ended', actorUserId: auth.user.id, tenantId: auth.tenant.id });
}

export async function endOtherSessions(auth: AuthContext): Promise<number> {
  const n = await revokeAllSessions(auth.user.id, auth.sessionId);
  await audit({
    action: 'account.sessions_ended',
    actorUserId: auth.user.id,
    tenantId: auth.tenant.id,
    details: { count: n },
  });
  return n;
}

/** "Exportar os meus dados (JSON)": everything we hold about the user; grows with each module. */
export async function exportData(auth: AuthContext) {
  const [u] = await db().select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  const [t] = await db().select().from(tenants).where(eq(tenants.id, auth.tenant.id)).limit(1);
  await audit({ action: 'account.exported', actorUserId: auth.user.id, tenantId: auth.tenant.id });
  return {
    exportedAt: new Date().toISOString(),
    format: 'knowledgehub-export/1',
    user: u && {
      id: u.id,
      name: u.name,
      email: u.email,
      lang: u.lang,
      createdAt: u.createdAt,
      emailVerifiedAt: u.emailVerifiedAt,
      twoFactor: Boolean(u.totpEnabledAt),
    },
    tenant: t && { id: t.id, name: t.name, kind: t.kind, plan: auth.tenant.planCode },
    prefs: await getPrefs(auth.user.id),
    sessions: await listSessions(auth),
  };
}
