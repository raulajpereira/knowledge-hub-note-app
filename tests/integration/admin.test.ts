import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Fase 10: the Admin Console's services — roles checked on the server, 2FA
// mandatory, overview figures, codes (generate, edit, extend, pause, revoke
// with 30-day restore) and the audit log with its CSV.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('admin console', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let guard: typeof import('@/server/admin/guard');
  let clients: typeof import('@/server/admin/clients');
  let acodes: typeof import('@/server/admin/codes');
  let aaudit: typeof import('@/server/admin/audit');
  let tenantsSvc: typeof import('@/server/admin/tenants');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, guard, clients, acodes, aaudit, tenantsSvc, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/admin/guard'),
      import('@/server/admin/clients'),
      import('@/server/admin/codes'),
      import('@/server/admin/audit'),
      import('@/server/admin/tenants'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE plan_requests, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  async function signedIn(email: string, plan = 'PRO', seats = 1) {
    const c = await codesSvc.createCode({ type: 'license', planCode: plan, maxUses: seats });
    await svc.register(
      { name: email.split('@')[0]!, email, password: 'Correct-Horse-9', code: c.code },
      meta,
    );
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password: 'Correct-Horse-9', remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
  const makeAdmin = async (userId: string, role: string) =>
    admin.unsafe(`insert into admins (user_id, role) values ('${userId}', '${role}')`);

  it('roles are checked on the server; 2FA is mandatory; non-admins get a 404', async () => {
    const u = await signedIn('ana@kh.pt');
    expect(await codeOf(guard.checkAdmin(u, 'overview'))).toBe('not_found');
    await makeAdmin(u.user.id, 'support');
    expect(await codeOf(guard.checkAdmin(u, 'overview'))).toBe('admin_2fa_required');
    const withTotp = { ...u, user: { ...u.user, totpEnabled: true } };
    expect(await codeOf(guard.checkAdmin(withTotp, 'overview'))).toBe('ok');
    // support: users and requests, commercial data read-only, no admins
    expect(await codeOf(guard.checkAdmin(withTotp, 'clients'))).toBe('ok');
    expect(await codeOf(guard.checkAdmin(withTotp, 'clients', true))).toBe('forbidden');
    expect(await codeOf(guard.checkAdmin(withTotp, 'users', true))).toBe('ok');
    expect(await codeOf(guard.checkAdmin(withTotp, 'codes', true))).toBe('forbidden');
    expect(await codeOf(guard.checkAdmin(withTotp, 'admins'))).toBe('forbidden');
    // read-only sees, never writes; a paused admin is no admin
    await admin.unsafe(`update admins set role = 'readonly' where user_id = '${u.user.id}'`);
    expect(await codeOf(guard.checkAdmin(withTotp, 'codes'))).toBe('ok');
    expect(await codeOf(guard.checkAdmin(withTotp, 'codes', true))).toBe('forbidden');
    await admin.unsafe(`update admins set status = 'paused' where user_id = '${u.user.id}'`);
    expect(await codeOf(guard.checkAdmin(withTotp, 'overview'))).toBe('not_found');
  });

  it('overview: MRR from plans and cycles, trials worth 0, attention rules', async () => {
    const a = await signedIn('pack@kh.pt', 'PRO', 10);
    const b = await signedIn('ind@kh.pt', 'SAP', 1);
    // PRO 6 €/user/month × 10 seats monthly = 60; SAP 14 × 1 annual −20 % = 11,2
    await admin.unsafe(`update tenants set billing_cycle = 'annual' where id = '${b.tenant.id}'`);
    let o = await clients.overview();
    expect(o.mrr).toBeCloseTo(71.2, 2);
    expect(o.arr).toBeCloseTo(854.4, 2);
    expect(o.paying).toBe(2);
    expect([o.used, o.seats]).toEqual([2, 11]);
    // a trial ending soon, an overdue client and a renewal within 30 days
    await admin.unsafe(
      `update tenants set status = 'trial', trial_ends_at = now() + interval '5 days' where id = '${b.tenant.id}'`,
    );
    await admin.unsafe(
      `update tenants set status = 'past_due', renew_at = now() - interval '3 days' where id = '${a.tenant.id}'`,
    );
    o = await clients.overview();
    expect(o.mrr).toBeCloseTo(60, 2); // trial = 0, past_due still counts
    expect(o.attention.map((x) => [x.cat, x.name])).toEqual([
      ['late', 'pack'],
      ['trial', 'ind'],
    ]);
    // the quick actions
    const boss = await signedIn('boss@kh.pt');
    await makeAdmin(boss.user.id, 'owner');
    const ctx = await guard.checkAdmin(
      { ...boss, user: { ...boss.user, totpEnabled: true } },
      'clients',
      true,
    );
    await tenantsSvc.quickAction(ctx, a.tenant.id, 'reminder', null);
    expect((await fs.readdir(outbox)).some((f) => f.includes('-paymentReminder-'))).toBe(true);
    await tenantsSvc.quickAction(ctx, b.tenant.id, 'convert', null);
    const [t] = await admin.unsafe(`select status, trial_ends_at from tenants where id = '${b.tenant.id}'`);
    expect(t).toMatchObject({ status: 'active', trial_ends_at: null });
    expect(await codeOf(tenantsSvc.quickAction(ctx, b.tenant.id, 'convert', null))).toBe('not_trial');
  });

  it('codes: generate, edit, extend, pause, revoke keeps 30 days and restores; audit + CSV', async () => {
    const boss = await signedIn('boss@kh.pt');
    await makeAdmin(boss.user.id, 'owner');
    const ctx = await guard.checkAdmin({ ...boss, user: { ...boss.user, totpEnabled: true } }, 'codes', true);
    const lic = await acodes.generateCode(ctx, {
      type: 'license',
      plan: 'SAP',
      maxUses: 3,
      lifetime: false,
      days: 10,
    });
    expect(lic.code).toMatch(/^KH-LIC-\d{6}$/);
    expect(
      await codeOf(acodes.generateCode(ctx, { type: 'invite', plan: 'CUSTOM', maxUses: 1, lifetime: true })),
    ).toBe('invalid_input');
    // someone registers with it: holder is the tenant it created
    await svc.register(
      { name: 'Cliente', email: 'c@kh.pt', password: 'Correct-Horse-9', code: lic.code },
      meta,
    );
    let row = (await acodes.listCodes()).find((c) => c.code === lic.code)!;
    expect(row).toMatchObject({ uses: 1, maxUses: 3, status: 'active', plan: { code: 'SAP' } });
    expect(row.holder).toMatchObject({ name: 'Cliente' });
    expect((await acodes.codeUsers(lic.code)).map((u) => u.email)).toEqual(['c@kh.pt']);
    // never fewer users than uses; lifetime; +30 days on a dated code
    await acodes.editCode(ctx, lic.code, { maxUses: 0 + 1, expiresAt: '2020-01-01' });
    row = (await acodes.listCodes()).find((c) => c.code === lic.code)!;
    expect(row).toMatchObject({ maxUses: 1, status: 'expired' });
    await acodes.extendCode(ctx, lic.code);
    row = (await acodes.listCodes()).find((c) => c.code === lic.code)!;
    expect(row.status).toBe('active');
    expect(Date.parse(row.expiresAt!)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    // pause → no access; revoke → listed as restorable; restore → back
    await codesSvc.pauseCode(lic.code, boss.user.id);
    expect(
      await codeOf(svc.login({ email: 'c@kh.pt', password: 'Correct-Horse-9', remember: false }, meta)),
    ).toBe('code_paused');
    await codesSvc.resumeCode(lic.code, boss.user.id);
    await codesSvc.revokeCode(lic.code, boss.user.id);
    row = (await acodes.listCodes()).find((c) => c.code === lic.code)!;
    expect(row.status).toBe('revoked');
    expect(Date.parse(row.restoreUntil!)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await codesSvc.restoreCode(lic.code, boss.user.id);
    expect((await acodes.listCodes()).find((c) => c.code === lic.code)!.status).toBe('active');

    // audit: area filter, text search, who; CSV with BOM and ; separators
    const from = new Date(Date.now() - 3600_000);
    const to = new Date(Date.now() + 60_000);
    const codeRows = await aaudit.queryAudit({ from, to, area: 'codes' });
    expect(codeRows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'code.create',
        'code.edit',
        'code.extend',
        'code.pause',
        'code.revoke',
        'code.restore',
      ]),
    );
    expect(codeRows.every((r) => r.area === 'codes')).toBe(true);
    const mine = await aaudit.queryAudit({ from, to, actor: boss.user.id, q: lic.code });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.actor?.email === 'boss@kh.pt')).toBe(true);
    const sys = await aaudit.queryAudit({ from, to, area: 'system' });
    expect(sys.every((r) => r.area === 'system')).toBe(true);
    const csv = aaudit.auditCsv(codeRows.slice(0, 2), () => ({ area: 'Códigos', action: 'X;"y"' }));
    expect(csv.startsWith('﻿"Quando (ISO)";"Quem"')).toBe(true);
    expect(csv).toContain('"X;""y"""');
  });
});
