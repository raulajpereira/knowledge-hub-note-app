import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { authTokens, codeRedemptions, codes, recoveryCodes, tenants, users } from '@/db/schema';
import { decryptSecret, encryptSecret, randomToken, safeEqual, sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { redis } from '@/lib/redis';
import type { Lang } from '@/i18n';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import { createCode, redeemCode } from '@/server/licensing/codes';
import { codeType, normalizeCode } from '@/server/licensing/codeFormat';
import { burnPasswordCheck, checkPasswordPolicy, hashPassword, verifyPassword } from './password';
import { captchaNeeded, captchaSiteKey, noteLoginFailure, verifyCaptcha } from './captcha';
import { Lockout, allow } from './rateLimit';
import {
  accessProblem,
  createSession,
  markReauthenticated,
  revokeAllSessions,
  type AuthContext,
} from './session';
import { newRecoveryCodes, newTotpSecret, otpauthUri, totpStep, verifyTotp } from './totp';

export type RequestMeta = { ip: string | null; userAgent: string | null; lang: Lang };

const VERIFY_TTL = 24 * 3600 * 1000;
const RESET_TTL = 30 * 60 * 1000; // SECURITY.md: 30 min, single use
export const SETUP_TTL = 7 * 24 * 3600 * 1000;

const loginLock = new Lockout('login');
const twoFaLock = new Lockout('2fa');
const reauthLock = new Lockout('reauth');

const appLink = (path: string) => `${env().APP_URL.replace(/\/$/, '')}${path}`;

// ── Single-use email tokens ─────────────────────────────────────────────────
async function issueToken(
  userId: string,
  purpose: 'verify' | 'reset' | 'setup',
  ttlMs: number,
): Promise<string> {
  const token = randomToken(32);
  // Only the newest link of a kind works.
  await db()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await db()
    .insert(authTokens)
    .values({ tokenHash: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function peekToken(token: string, purposes: ReadonlyArray<'verify' | 'reset' | 'setup'>) {
  if (!token || token.length > 100) return null;
  const [row] = await db()
    .select({ userId: authTokens.userId, purpose: authTokens.purpose, email: users.email })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        inArray(authTokens.purpose, [...purposes]),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function sendVerification(userId: string, email: string, lang: Lang) {
  const token = await issueToken(userId, 'verify', VERIFY_TTL);
  await sendMail(renderMail('verify', lang, email, appLink(`/verify-email?token=${token}`)));
}

export async function sendSetupLink(userId: string, email: string, lang: Lang) {
  const token = await issueToken(userId, 'setup', SETUP_TTL);
  await sendMail(renderMail('setup', lang, email, appLink(`/reset-password?token=${token}`)));
}

/** "Repor password" from the Admin Console: the same reset link the user would ask for. */
export async function sendResetLink(userId: string, email: string, lang: Lang) {
  const token = await issueToken(userId, 'reset', RESET_TTL);
  await sendMail(renderMail('reset', lang, email, appLink(`/reset-password?token=${token}`)));
}

// ── Register ────────────────────────────────────────────────────────────────
export async function register(
  input: { name: string; email: string; password: string; code?: string },
  meta: RequestMeta,
): Promise<{ userId: string }> {
  if (!meta.ip || !(await allow(`register:${meta.ip}`, 10, 3600)))
    throw new ApiError(429, 'too_many_requests');
  const email = input.email.trim().toLowerCase();
  // Someone invited to a shared folder (Partilha) signs up without a code: a
  // FREE individual account (decision of the user, Fase 9). The memberships
  // only become active once the email is confirmed (verifyEmail).
  const invited = !input.code?.trim();
  const code = invited ? '' : normalizeCode(input.code!);
  if (!invited && !codeType(code)) throw new ApiError(400, 'code_invalid');
  const problem = await checkPasswordPolicy(input.password);
  if (problem) throw new ApiError(400, `password_${problem}`);

  const [existing] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ApiError(409, 'email_taken');
  if (invited && !(await shareInvited(email))) throw new ApiError(400, 'code_invalid');

  const passwordHash = await hashPassword(input.password);
  const useCode = invited ? (await createCode({ type: 'invite', planCode: 'FREE' })).code : code;
  const { userId, tenantId } = await db()
    .transaction(async (tx) => {
      const r = await redeemCode(tx, useCode, { name: input.name.trim() });
      const [u] = await tx
        .insert(users)
        .values({
          tenantId: r.tenantId,
          name: input.name.trim(),
          email,
          passwordHash,
          roleInTenant: r.role,
          lang: meta.lang,
          registeredWithCodeId: r.codeId,
          passwordChangedAt: new Date(),
        })
        .returning({ id: users.id });
      await tx.insert(codeRedemptions).values({ codeId: r.codeId, userId: u!.id });
      return { userId: u!.id, tenantId: r.tenantId };
    })
    .catch((err: unknown) => {
      // Concurrent sign-up with the same email: the unique index wins.
      const pg = (err as { cause?: { code?: string } }).cause ?? (err as { code?: string });
      if (pg?.code === '23505') throw new ApiError(409, 'email_taken');
      throw err;
    });

  await sendVerification(userId, email, meta.lang);
  await audit({
    action: 'user.register',
    actorUserId: userId,
    tenantId,
    targetType: 'code',
    targetId: useCode,
    details: invited ? { via: 'share_invite' } : undefined,
    ip: meta.ip,
  });
  return { userId };
}

/** A pending shared-folder invitation for this email (no account yet). */
async function shareInvited(email: string) {
  const r = (await db().execute(sql`select kh_share_invited(${email}::citext) as ok`)) as unknown as
    { rows: Array<{ ok: boolean }> } | Array<{ ok: boolean }>;
  return !!(Array.isArray(r) ? r : r.rows)[0]?.ok;
}

// ── Login (+ 2FA) ───────────────────────────────────────────────────────────
type LoginResult =
  { kind: 'session'; token: string; remember: boolean } | { kind: 'two_factor'; challenge: string };

async function loadForLogin(email: string) {
  const [row] = await db()
    .select({
      id: users.id,
      email: users.email,
      lang: users.lang,
      tenantId: users.tenantId,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      userStatus: users.status,
      totpEnabledAt: users.totpEnabledAt,
      tenantDeletedAt: tenants.deletedAt,
      tenantStatus: tenants.status,
      codeStatus: codes.status,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .leftJoin(codes, eq(codes.id, users.registeredWithCodeId))
    .where(eq(users.email, email))
    .limit(1);
  return row;
}

export async function login(
  input: { email: string; password: string; remember: boolean; captcha?: string },
  meta: RequestMeta,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const lockKey = `${email}|${meta.ip ?? '-'}`;
  const wait = await loginLock.lockedFor(lockKey);
  if (wait) throw new ApiError(429, 'locked', undefined, { retryAfter: wait });
  const st = await loginLock.state(lockKey);
  if ((await captchaNeeded(st.fails, st.lockouts, meta.ip)) && !(await verifyCaptcha(input.captcha, meta.ip)))
    throw new ApiError(403, 'captcha_required', undefined, { siteKey: captchaSiteKey() });

  const u = await loadForLogin(email);
  const ok = u
    ? await verifyPassword(u.passwordHash, input.password)
    : (await burnPasswordCheck(input.password), false);
  if (!u || !ok) {
    const locked = await loginLock.fail(lockKey);
    await noteLoginFailure(meta.ip);
    await audit({ action: 'auth.login_failed', details: { email }, ip: meta.ip });
    if (locked) throw new ApiError(429, 'locked', undefined, { retryAfter: locked });
    throw new ApiError(401, 'bad_credentials');
  }
  await loginLock.success(lockKey);

  const problem = accessProblem(u);
  if (problem === 'unverified') {
    if (await allow(`verify-resend:${u.id}`, 3, 3600)) await sendVerification(u.id, u.email, u.lang);
    throw new ApiError(403, 'unverified');
  }
  if (problem) throw new ApiError(403, problem);

  if (u.totpEnabledAt) {
    const challenge = randomToken(24);
    await redis().set(
      `kh:2fa:${challenge}`,
      JSON.stringify({ userId: u.id, remember: input.remember }),
      'EX',
      300,
    );
    return { kind: 'two_factor', challenge };
  }
  const s = await createSession(u.id, { remember: input.remember, ip: meta.ip, userAgent: meta.userAgent });
  await audit({ action: 'auth.login', actorUserId: u.id, tenantId: u.tenantId, ip: meta.ip });
  return { kind: 'session', token: s.token, remember: input.remember };
}

async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const hash = sha256(code.trim().toUpperCase());
  const rows = await db()
    .select()
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  const hit = rows.find((r) => safeEqual(r.codeHash, hash));
  if (!hit) return false;
  // only the request that marks it used wins (two at once can't both use one code)
  const won = await db()
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(recoveryCodes.id, hit.id), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id });
  return won.length > 0;
}

/** A TOTP code counts once: its time step must be newer than the last one accepted. */
async function claimTotpStep(userId: string, step: number | null): Promise<boolean> {
  if (step === null) return false;
  const r = await db()
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return r.length > 0;
}

export async function completeTwoFactor(
  input: { challenge: string; code: string },
  meta: RequestMeta,
): Promise<{ token: string; remember: boolean }> {
  const raw = await redis().get(`kh:2fa:${input.challenge}`);
  if (!raw) throw new ApiError(401, 'challenge_expired');
  const { userId, remember } = JSON.parse(raw) as { userId: string; remember: boolean };
  const wait = await twoFaLock.lockedFor(userId);
  if (wait) throw new ApiError(429, 'locked', undefined, { retryAfter: wait });

  const [u] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  const code = input.code.replace(/\s+/g, '');
  const ok =
    !!u?.totpSecretEnc &&
    ((await claimTotpStep(userId, totpStep(decryptSecret(u.totpSecretEnc), code))) ||
      (code.length > 6 && (await consumeRecoveryCode(userId, code))));
  if (!u || !ok) {
    const locked = await twoFaLock.fail(userId);
    if (locked) throw new ApiError(429, 'locked', undefined, { retryAfter: locked });
    throw new ApiError(401, 'bad_2fa_code');
  }
  await twoFaLock.success(userId);
  await redis().del(`kh:2fa:${input.challenge}`);
  const s = await createSession(userId, { remember, ip: meta.ip, userAgent: meta.userAgent });
  await audit({
    action: 'auth.login',
    actorUserId: userId,
    tenantId: u.tenantId,
    ip: meta.ip,
    details: { twoFactor: true },
  });
  return { token: s.token, remember };
}

// ── Email verification ──────────────────────────────────────────────────────
export async function verifyEmail(token: string): Promise<boolean> {
  const t = await peekToken(token, ['verify']);
  if (!t) return false;
  await db().transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(eq(authTokens.tokenHash, sha256(token)));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, t.userId));
    // shared folders this email was invited to are now theirs
    await tx.execute(sql`select kh_share_bind(${t.userId}::uuid, ${t.email}::citext)`);
  });
  await audit({ action: 'user.email_verified', actorUserId: t.userId });
  return true;
}

// ── Forgot / reset password ─────────────────────────────────────────────────
/** Always behaves the same, whether or not the email exists (no account enumeration). */
export async function forgotPassword(emailInput: string, meta: RequestMeta): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const allowed =
    (await allow(`forgot:${email}`, 5, 3600)) &&
    (!meta.ip || (await allow(`forgot-ip:${meta.ip}`, 20, 3600)));
  if (!allowed) return;
  const u = await loadForLogin(email);
  if (!u || u.userStatus === 'disabled') return;
  const token = await issueToken(u.id, 'reset', RESET_TTL);
  await sendMail(renderMail('reset', u.lang, u.email, appLink(`/reset-password?token=${token}`)));
  await audit({ action: 'auth.reset_requested', actorUserId: u.id, ip: meta.ip });
}

/** For the ResetPassword page: which state to show (form vs invalid / expired). */
export async function inspectResetToken(token: string): Promise<{ email: string; setup: boolean } | null> {
  const t = await peekToken(token, ['reset', 'setup']);
  return t ? { email: t.email, setup: t.purpose === 'setup' } : null;
}

export async function resetPassword(
  input: { token: string; password: string },
  meta: RequestMeta,
): Promise<void> {
  const t = await peekToken(input.token, ['reset', 'setup']);
  if (!t) throw new ApiError(400, 'token_invalid');
  const [u] = await db().select().from(users).where(eq(users.id, t.userId)).limit(1);
  if (!u) throw new ApiError(400, 'token_invalid');
  if (await verifyPassword(u.passwordHash, input.password)) throw new ApiError(400, 'password_same');
  const problem = await checkPasswordPolicy(input.password);
  if (problem) throw new ApiError(400, `password_${problem}`);

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const consumed = await db().transaction(async (tx) => {
    // Re-check inside the transaction so a token can only ever be used once.
    const used = await tx
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.tokenHash, sha256(input.token)),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, now),
        ),
      )
      .returning({ userId: authTokens.userId });
    if (!used.length) return false;
    await tx
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: now,
        // The link proves the address: a reset/setup also verifies the email.
        emailVerifiedAt: u.emailVerifiedAt ?? now,
      })
      .where(eq(users.id, u.id));
    return true;
  });
  if (!consumed) throw new ApiError(400, 'token_invalid');

  await revokeAllSessions(u.id); // SECURITY.md: end every session
  await sendMail(renderMail('changed', u.lang, u.email));
  await audit({
    action: 'auth.password_reset',
    actorUserId: u.id,
    tenantId: u.tenantId,
    ip: meta.ip,
    details: { purpose: t.purpose },
  });
}

// ── Lock screen re-auth ─────────────────────────────────────────────────────
export async function reauthenticate(auth: AuthContext, password: string, meta: RequestMeta): Promise<void> {
  const wait = await reauthLock.lockedFor(auth.user.id);
  if (wait) throw new ApiError(429, 'locked', undefined, { retryAfter: wait });
  const [u] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1);
  if (!(await verifyPassword(u?.passwordHash ?? null, password))) {
    const locked = await reauthLock.fail(auth.user.id);
    if (locked) throw new ApiError(429, 'locked', undefined, { retryAfter: locked });
    throw new ApiError(401, 'bad_credentials');
  }
  await reauthLock.success(auth.user.id);
  await markReauthenticated(auth.sessionId);
  await audit({ action: 'auth.reauth', actorUserId: auth.user.id, tenantId: auth.tenant.id, ip: meta.ip });
}

// ── 2FA management ──────────────────────────────────────────────────────────
export async function beginTotpSetup(auth: AuthContext): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret();
  await redis().set(`kh:2fa-setup:${auth.user.id}`, secret, 'EX', 600);
  return { secret, uri: otpauthUri(secret, auth.user.email) };
}

export async function enableTotp(auth: AuthContext, code: string): Promise<{ recoveryCodes: string[] }> {
  const secret = await redis().get(`kh:2fa-setup:${auth.user.id}`);
  if (!secret) throw new ApiError(400, 'setup_expired');
  if (!verifyTotp(secret, code.replace(/\s+/g, ''))) throw new ApiError(400, 'bad_2fa_code');
  const codesPlain = newRecoveryCodes();
  await db().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ totpSecretEnc: encryptSecret(secret), totpEnabledAt: new Date() })
      .where(eq(users.id, auth.user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, auth.user.id));
    await tx
      .insert(recoveryCodes)
      .values(codesPlain.map((c) => ({ userId: auth.user.id, codeHash: sha256(c) })));
  });
  await redis().del(`kh:2fa-setup:${auth.user.id}`);
  await audit({ action: 'auth.2fa_enabled', actorUserId: auth.user.id, tenantId: auth.tenant.id });
  return { recoveryCodes: codesPlain };
}

export async function disableTotp(auth: AuthContext, password: string, code: string): Promise<void> {
  const [u] = await db().select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!u?.totpSecretEnc) return;
  const ok =
    (await verifyPassword(u.passwordHash, password)) &&
    verifyTotp(decryptSecret(u.totpSecretEnc), code.replace(/\s+/g, ''));
  if (!ok) throw new ApiError(401, 'bad_credentials');
  await db().transaction(async (tx) => {
    await tx.update(users).set({ totpSecretEnc: null, totpEnabledAt: null }).where(eq(users.id, u.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, u.id));
  });
  await audit({ action: 'auth.2fa_disabled', actorUserId: u.id, tenantId: u.tenantId });
}
