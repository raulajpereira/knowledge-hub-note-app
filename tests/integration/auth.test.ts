import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';

// Phase 2 business rules end-to-end through the real services, Postgres and
// Redis (acceptance criteria of ROADMAP Fase 1/2 + SECURITY.md §2).
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.7', userAgent: 'vitest', lang: 'pt' as const };

async function lastMail(to: string, kind: string) {
  const files = (await fs.readdir(outbox).catch(() => [] as string[])).filter(
    (f) => f.includes(`-${kind}-`) && f.includes(to.replace(/[^a-z0-9@.]/gi, '_')),
  );
  files.sort();
  const f = files.at(-1);
  if (!f) return null;
  return JSON.parse(await fs.readFile(path.join(outbox, f), 'utf8')) as { text: string; subject: string };
}
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

describe.skipIf(!enabled)('auth, codes and entitlements', () => {
  // Imported lazily so env() sees the test configuration.
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let ent: typeof import('@/server/licensing/entitlements');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let totp: typeof import('@/server/auth/totp');
  let schema: typeof import('@/db/schema');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, ent, session, seed, totp, schema, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/licensing/entitlements'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/auth/totp'),
      import('@/db/schema'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
  });

  afterAll(async () => {
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function registerAndVerify(email: string, code: string, password = 'Correct-Horse-9') {
    await svc.register({ name: email.split('@')[0]!, email, password, code }, meta);
    const mail = await lastMail(email, 'verify');
    expect(mail?.subject).toMatch(/Confirme/);
    expect(await svc.verifyEmail(tokenFrom(mail!.text))).toBe(true);
  }

  async function loginToken(email: string, password = 'Correct-Horse-9') {
    const r = await svc.login({ email, password, remember: true }, meta);
    if (r.kind !== 'session') throw new Error('expected a session');
    return r.token;
  }

  it('KH-LIC: first use creates the tenant (admin), next seats join it, then it is used up', async () => {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 2, clientName: 'Acme' });
    await registerAndVerify('ana@acme.pt', c.code);
    await registerAndVerify('rui@acme.pt', c.code.replace('KH-LIC-', 'kh-lic-')); // input normalised

    const rows = await dbm.db().select().from(schema.users).orderBy(schema.users.createdAt);
    expect(rows.map((r) => r.roleInTenant)).toEqual(['admin', 'member']);
    expect(rows[0]!.tenantId).toBe(rows[1]!.tenantId);
    const [t] = await dbm.db().select().from(schema.tenants).where(eq(schema.tenants.id, rows[0]!.tenantId));
    expect(t).toMatchObject({ name: 'Acme', kind: 'pack', seats: 2 });

    await expect(
      svc.register({ name: 'X', email: 'x@acme.pt', password: 'Correct-Horse-9', code: c.code }, meta),
    ).rejects.toMatchObject({ code: 'code_used_up' });
  });

  it('KH-INV with a tenant joins it; without a tenant creates an individual FREE tenant', async () => {
    const lic = await codesSvc.createCode({ type: 'license', planCode: 'SAP', maxUses: 3 });
    await registerAndVerify('lead@x.pt', lic.code);
    const [lead] = await dbm.db().select().from(schema.users).where(eq(schema.users.email, 'lead@x.pt'));
    const inv = await codesSvc.createCode({ type: 'invite', tenantId: lead!.tenantId });
    await registerAndVerify('member@x.pt', inv.code);
    const [m] = await dbm.db().select().from(schema.users).where(eq(schema.users.email, 'member@x.pt'));
    expect(m).toMatchObject({ tenantId: lead!.tenantId, roleInTenant: 'member' });

    const solo = await codesSvc.createCode({ type: 'invite' });
    await registerAndVerify('solo@y.pt', solo.code);
    const token = await loginToken('solo@y.pt');
    const auth = await session.resolveSession(token);
    expect(auth?.tenant).toMatchObject({ kind: 'individual', planCode: 'FREE' });
    expect(auth?.user.roleInTenant).toBe('admin');
  });

  it('rejects invalid, paused and expired codes, and duplicate emails', async () => {
    const reg = (code: string, email = 'a@b.pt') =>
      svc.register({ name: 'A', email, password: 'Correct-Horse-9', code }, meta);
    await expect(reg('KH-LIC-000000')).rejects.toMatchObject({ code: 'code_invalid' });
    await expect(reg('nonsense')).rejects.toMatchObject({ code: 'code_invalid' });
    const p = await codesSvc.createCode({ type: 'license' });
    await codesSvc.pauseCode(p.code);
    await expect(reg(p.code)).rejects.toMatchObject({ code: 'code_paused' });
    const e = await codesSvc.createCode({ type: 'license', expiresAt: new Date(Date.now() - 1000) });
    await expect(reg(e.code)).rejects.toMatchObject({ code: 'code_expired' });
    const ok = await codesSvc.createCode({ type: 'license', maxUses: 5 });
    await reg(ok.code, 'dup@b.pt');
    await expect(reg(ok.code, 'DUP@b.pt')).rejects.toMatchObject({ code: 'email_taken' });
  });

  it('login requires a verified email, then creates a working session', async () => {
    const c = await codesSvc.createCode({ type: 'license' });
    await svc.register({ name: 'V', email: 'v@z.pt', password: 'Correct-Horse-9', code: c.code }, meta);
    await expect(
      svc.login({ email: 'v@z.pt', password: 'Correct-Horse-9', remember: false }, meta),
    ).rejects.toMatchObject({ code: 'unverified' });
    const mail = await lastMail('v@z.pt', 'verify');
    expect(await svc.verifyEmail(tokenFrom(mail!.text))).toBe(true);
    expect(await svc.verifyEmail(tokenFrom(mail!.text))).toBe(false); // single use
    const token = await loginToken('v@z.pt');
    expect((await session.resolveSession(token))?.user.email).toBe('v@z.pt');
    expect(await session.resolveSession('x'.repeat(43))).toBeNull();
  });

  it('locks login for 30 s after 5 wrong passwords (same answer for unknown emails)', async () => {
    const c = await codesSvc.createCode({ type: 'license' });
    await registerAndVerify('l@z.pt', c.code);
    for (let i = 0; i < 4; i++) {
      await expect(
        svc.login({ email: 'l@z.pt', password: 'wrong', remember: false }, meta),
      ).rejects.toMatchObject({ code: 'bad_credentials' });
    }
    await expect(
      svc.login({ email: 'l@z.pt', password: 'wrong', remember: false }, meta),
    ).rejects.toMatchObject({ code: 'locked', extra: { retryAfter: 30 } });
    // Even the right password waits until the lock expires.
    await expect(
      svc.login({ email: 'l@z.pt', password: 'Correct-Horse-9', remember: false }, meta),
    ).rejects.toMatchObject({ code: 'locked' });
    await expect(
      svc.login({ email: 'nobody@z.pt', password: 'x', remember: false }, meta),
    ).rejects.toMatchObject({ code: 'bad_credentials' });
  });

  it('password reset: single use, 30 min, ends every session, sends confirmation', async () => {
    const c = await codesSvc.createCode({ type: 'license' });
    await registerAndVerify('r@z.pt', c.code);
    const s1 = await loginToken('r@z.pt');
    await svc.forgotPassword('r@z.pt', meta);
    await svc.forgotPassword('unknown@z.pt', meta); // no error, no mail
    expect(await lastMail('unknown@z.pt', 'reset')).toBeNull();
    const token = tokenFrom((await lastMail('r@z.pt', 'reset'))!.text);
    expect(await svc.inspectResetToken(token)).toMatchObject({ email: 'r@z.pt', setup: false });

    await expect(svc.resetPassword({ token, password: 'Correct-Horse-9' }, meta)).rejects.toMatchObject({
      code: 'password_same',
    });
    await svc.resetPassword({ token, password: 'New-Password-77' }, meta);
    expect(await session.resolveSession(s1)).toBeNull(); // old session gone
    expect((await lastMail('r@z.pt', 'changed'))?.subject).toMatch(/alterada/);
    await expect(svc.resetPassword({ token, password: 'Another-Pass-88' }, meta)).rejects.toMatchObject({
      code: 'token_invalid',
    });
    await expect(loginToken('r@z.pt')).rejects.toMatchObject({ code: 'bad_credentials' });
    expect(await loginToken('r@z.pt', 'New-Password-77')).toBeTruthy();

    // Expired link → invalid
    await svc.forgotPassword('r@z.pt', meta);
    const t2 = tokenFrom((await lastMail('r@z.pt', 'reset'))!.text);
    await admin.unsafe(
      `UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL`,
    );
    expect(await svc.inspectResetToken(t2)).toBeNull();
  });

  it('pause / revoke cut access immediately; resume / restore bring it back', async () => {
    const c = await codesSvc.createCode({ type: 'license', maxUses: 2 });
    await registerAndVerify('p@z.pt', c.code);
    const token = await loginToken('p@z.pt');

    await codesSvc.pauseCode(c.code);
    expect(await session.resolveSession(token)).toBeNull();
    await expect(loginToken('p@z.pt')).rejects.toMatchObject({ code: 'code_paused' });
    await codesSvc.resumeCode(c.code);
    const t2 = await loginToken('p@z.pt');

    await codesSvc.revokeCode(c.code);
    expect(await session.resolveSession(t2)).toBeNull();
    await expect(loginToken('p@z.pt')).rejects.toMatchObject({ code: 'code_revoked' });
    const [code] = await dbm.db().select().from(schema.codes).where(eq(schema.codes.code, c.code));
    const [t] = await dbm.db().select().from(schema.tenants).where(eq(schema.tenants.id, code!.tenantId!));
    expect(t!.deletedAt).not.toBeNull(); // data kept, marked for purge in 30 days

    await codesSvc.restoreCode(c.code);
    expect(await loginToken('p@z.pt')).toBeTruthy();
  });

  it('entitlements come from the plan (+ add-ons) and FREE limits are enforced', async () => {
    const free = await codesSvc.createCode({ type: 'invite' });
    await registerAndVerify('f@z.pt', free.code);
    const auth = await session.resolveSession(await loginToken('f@z.pt'));
    const e = await ent.getEntitlements(auth!.tenant.id);
    expect(e.modules).toEqual(['notes', 'tasks']);
    expect(e.limits).toMatchObject({ notes: 30, tasks: 20 });
    await expect(ent.requireModule(auth!.tenant.id, 'passwords')).rejects.toMatchObject({
      code: 'module_not_included',
    });
    await expect(ent.assertWithinLimit(auth!.tenant.id, 'notes', 29)).resolves.toBeUndefined();
    await expect(ent.assertWithinLimit(auth!.tenant.id, 'notes', 30)).rejects.toMatchObject({
      code: 'limit_reached',
    });

    await dbm.db().insert(schema.tenantModules).values({ tenantId: auth!.tenant.id, moduleId: 'passwords' });
    await ent.invalidateEntitlements(auth!.tenant.id);
    await expect(ent.requireModule(auth!.tenant.id, 'passwords')).resolves.toBeUndefined();

    const sap = await codesSvc.createCode({ type: 'license', planCode: 'SAP' });
    await registerAndVerify('s@z.pt', sap.code);
    const a2 = await session.resolveSession(await loginToken('s@z.pt'));
    const e2 = await ent.getEntitlements(a2!.tenant.id);
    expect(e2.modules).toEqual(expect.arrayContaining(['codelib', 'fn_proc', 'fn_cut', 'tcodes']));
    expect(e2.limits).toEqual({});
  });

  it('2FA: login asks for a TOTP code; recovery codes work once', async () => {
    const c = await codesSvc.createCode({ type: 'license' });
    await registerAndVerify('t@z.pt', c.code);
    const auth = await session.resolveSession(await loginToken('t@z.pt'));
    const { secret } = await svc.beginTotpSetup(auth!);
    await expect(svc.enableTotp(auth!, '000000')).rejects.toMatchObject({ code: 'bad_2fa_code' });
    const { recoveryCodes } = await svc.enableTotp(auth!, totp.totp(secret));
    expect(recoveryCodes).toHaveLength(10);

    const step = await svc.login({ email: 't@z.pt', password: 'Correct-Horse-9', remember: false }, meta);
    expect(step.kind).toBe('two_factor');
    const challenge = (step as { challenge: string }).challenge;
    await expect(svc.completeTwoFactor({ challenge, code: '123456' }, meta)).rejects.toMatchObject({
      code: 'bad_2fa_code',
    });
    const done = await svc.completeTwoFactor({ challenge, code: totp.totp(secret) }, meta);
    expect(await session.resolveSession(done.token)).not.toBeNull();
    // the same code can't be used again (replay of a seen code)
    const again = await svc.login({ email: 't@z.pt', password: 'Correct-Horse-9', remember: false }, meta);
    await expect(
      svc.completeTwoFactor(
        { challenge: (again as { challenge: string }).challenge, code: totp.totp(secret) },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'bad_2fa_code' });

    const s2 = await svc.login({ email: 't@z.pt', password: 'Correct-Horse-9', remember: false }, meta);
    const ch2 = (s2 as { challenge: string }).challenge;
    await svc.completeTwoFactor({ challenge: ch2, code: recoveryCodes[0]! }, meta);
    const s3 = await svc.login({ email: 't@z.pt', password: 'Correct-Horse-9', remember: false }, meta);
    await expect(
      svc.completeTwoFactor(
        { challenge: (s3 as { challenge: string }).challenge, code: recoveryCodes[0]! },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'bad_2fa_code' });
  });

  it('seed creates the super admin without a password; the setup link activates it', async () => {
    expect((await seed.seedSuperAdmin()).created).toBe(true);
    expect((await seed.seedSuperAdmin()).created).toBe(false); // idempotent
    await expect(loginToken('owner@example.com', 'anything')).rejects.toMatchObject({
      code: 'bad_credentials',
    });
    const token = tokenFrom((await lastMail('owner@example.com', 'setup'))!.text);
    expect(await svc.inspectResetToken(token)).toMatchObject({ setup: true });
    await svc.resetPassword({ token, password: 'Owner-Pass-123' }, meta);
    const auth = await session.resolveSession(await loginToken('owner@example.com', 'Owner-Pass-123'));
    expect(auth?.tenant.planCode).toBe('ULTRA');
    const e = await ent.getEntitlements(auth!.tenant.id);
    expect(e.modules).toEqual(expect.arrayContaining(['brand', 'passwords', 'mg_alloc', 'fn_cut']));
    const [a] = await dbm.db().select().from(schema.admins);
    expect(a).toMatchObject({ role: 'owner', status: 'active' });
  });

  it('lock-screen re-auth checks the password on the server', async () => {
    const c = await codesSvc.createCode({ type: 'license' });
    await registerAndVerify('k@z.pt', c.code);
    const auth = await session.resolveSession(await loginToken('k@z.pt'));
    await expect(svc.reauthenticate(auth!, 'wrong', meta)).rejects.toMatchObject({ code: 'bad_credentials' });
    await expect(svc.reauthenticate(auth!, 'Correct-Horse-9', meta)).resolves.toBeUndefined();
  });
});
