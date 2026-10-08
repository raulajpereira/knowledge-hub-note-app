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

  it('clients: new pack → first sign-up is its admin; subscription edits, custom groups, suspend = read-only', async () => {
    const boss = await signedIn('boss@kh.pt');
    await makeAdmin(boss.user.id, 'owner');
    const ctx = await guard.checkAdmin(
      { ...boss, user: { ...boss.user, totpEnabled: true } },
      'clients',
      true,
    );
    const { id, code } = await tenantsSvc.createClient(
      ctx,
      {
        name: 'Atlântico Retail',
        contactName: 'Marta',
        contactEmail: 'marta@atl.pt',
        plan: 'SAP',
        cycle: 'annual',
        seats: 3,
        start: 'trial',
      },
      null,
    );
    const [t0] = await admin.unsafe(`select status, kind, trial_ends_at from tenants where id = '${id}'`);
    expect(t0).toMatchObject({ status: 'trial', kind: 'pack' });
    expect(t0!.trial_ends_at).not.toBeNull();
    await svc.register({ name: 'Marta', email: 'marta@atl.pt', password: 'Correct-Horse-9', code }, meta);
    await svc.register({ name: 'Rui', email: 'rui@atl.pt', password: 'Correct-Horse-9', code }, meta);
    const people = await tenantsSvc.clientUsers([id]);
    expect(people.map((u) => [u.email, u.role])).toEqual([
      ['marta@atl.pt', 'admin'],
      ['rui@atl.pt', 'member'],
    ]);
    // invite for the free seat only
    const inv = await tenantsSvc.inviteToClient(ctx, id, null);
    expect((await acodes.listCodes()).find((c) => c.code === inv)).toMatchObject({
      maxUses: 1,
      type: 'invite',
    });
    // CUSTOM plan: its groups become modules; leaving it takes them away
    const ent = await import('@/server/licensing/entitlements');
    await tenantsSvc.updateClient(ctx, id, { plan: 'CUSTOM', addonGroups: ['mgmt'] }, null);
    let mods = (await ent.computeEntitlements(id)).modules;
    expect(mods).toEqual(expect.arrayContaining(['notes', 'calendar', 'mg_teams', 'mg_time']));
    expect(mods).not.toContain('codelib');
    await tenantsSvc.updateClient(ctx, id, { addonGroups: ['dev'] }, null);
    mods = (await ent.computeEntitlements(id)).modules;
    expect(mods).toEqual(expect.arrayContaining(['artifacts', 'devlib']));
    expect(mods).not.toContain('mg_teams');
    await tenantsSvc.updateClient(ctx, id, { plan: 'PRO' }, null);
    mods = (await ent.computeEntitlements(id)).modules;
    expect(mods).not.toContain('devlib');
    // one seat makes it an individual client
    await tenantsSvc.updateClient(ctx, id, { seats: 1 }, null);
    const [t1] = await admin.unsafe(`select kind from tenants where id = '${id}'`);
    expect(t1!.kind).toBe('individual');
    // suspended: reads stay, writes are refused (but not sign-in, account or console)
    await tenantsSvc.updateClient(ctx, id, { status: 'suspended' }, null);
    const vf = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes('marta@atl.pt'));
    const vm = JSON.parse(await fs.readFile(path.join(outbox, vf.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(vm.text)![1]!);
    const lg = await svc.login({ email: 'marta@atl.pt', password: 'Correct-Horse-9', remember: false }, meta);
    if (!('token' in lg)) throw new Error('2FA not expected');
    const marta = (await session.resolveSession(lg.token))!;
    expect(marta.tenant.status).toBe('suspended');
    const { currentRequest } = await import('@/server/http');
    const { assertWritable } = await import('@/server/auth/request');
    const run = (method: string, path: string) =>
      codeOf(Promise.resolve().then(() => currentRequest.run({ method, path }, () => assertWritable(marta))));
    expect(await run('GET', '/v2/api/v1/notes')).toBe('ok');
    expect(await run('POST', '/v2/api/v1/notes')).toBe('tenant_suspended');
    expect(await run('PATCH', '/v2/api/v1/me/prefs')).toBe('ok');
    expect(await run('POST', '/v2/api/v1/auth/logout')).toBe('ok');
    const acts = await aaudit.queryAudit({
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 60_000),
      tenantId: id,
    });
    expect(acts.map((a) => a.action)).toEqual(
      expect.arrayContaining(['tenant.create', 'tenant.update', 'tenant.custom', 'tenant.suspend']),
    );
  });

  it('users and admins: disable ends sessions, email change needs confirming, delete; admins never touch the Manager', async () => {
    const usersSvc = await import('@/server/admin/users');
    const adminsSvc = await import('@/server/admin/admins');
    const boss = await signedIn('boss@kh.pt');
    await makeAdmin(boss.user.id, 'owner');
    const ctx = await guard.checkAdmin({ ...boss, user: { ...boss.user, totpEnabled: true } }, 'users', true);
    const ana = await signedIn('ana@kh.pt');
    await usersSvc.updateUser(ctx, ana.user.id, { status: 'disabled' }, null);
    expect(await session.resolveSession('x'.repeat(43))).toBeNull();
    const [s] = await admin.unsafe(
      `select count(*)::int n from sessions where user_id = '${ana.user.id}' and revoked_at is null`,
    );
    expect(s!.n).toBe(0);
    await usersSvc.updateUser(ctx, ana.user.id, { status: 'active', email: 'ana.nova@kh.pt' }, null);
    const [u] = await admin.unsafe(`select email, email_verified_at from users where id = '${ana.user.id}'`);
    expect(u).toMatchObject({ email: 'ana.nova@kh.pt', email_verified_at: null });
    expect(
      (await fs.readdir(outbox)).some((f) => f.includes('-verify-') && f.includes('ana.nova@kh.pt')),
    ).toBe(true);
    await usersSvc.sendUserReset(ctx, ana.user.id, null);
    expect(
      (await fs.readdir(outbox)).some((f) => f.includes('-reset-') && f.includes('ana.nova@kh.pt')),
    ).toBe(true);
    // the Manager and oneself are off limits
    expect(await codeOf(usersSvc.updateUser(ctx, boss.user.id, { name: 'x' }, null))).toBe('forbidden');
    // deleting the only person of an individual client removes the client
    await usersSvc.deleteUser(ctx, ana.user.id, null);
    const [gone] = await admin.unsafe(`select count(*)::int n from tenants where id = '${ana.tenant.id}'`);
    expect(gone!.n).toBe(0);

    // Administradores
    const bia = await signedIn('bia@kh.pt');
    await adminsSvc.grantAdmin(ctx, 'BIA@kh.pt', 'billing');
    expect(await codeOf(adminsSvc.grantAdmin(ctx, 'bia@kh.pt', 'support'))).toBe('already_admin');
    expect(await codeOf(adminsSvc.grantAdmin(ctx, 'ninguem@kh.pt', 'support'))).toBe('no_account');
    await adminsSvc.updateAdmin(ctx, bia.user.id, { role: 'support', status: 'paused' });
    expect((await adminsSvc.listAdmins()).find((a) => a.email === 'bia@kh.pt')).toMatchObject({
      role: 'support',
      status: 'paused',
    });
    expect(await codeOf(adminsSvc.updateAdmin(ctx, boss.user.id, { role: 'readonly' }))).toBe('forbidden');
    expect(await codeOf(adminsSvc.removeAdmin(ctx, boss.user.id))).toBe('forbidden');
    await adminsSvc.removeAdmin(ctx, bia.user.id);
    expect((await adminsSvc.listAdmins()).map((a) => a.email)).toEqual(['boss@kh.pt']);
  });
});
