import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Fase 10.3: Pacotes e Preços (prices, modules, FREE limits, custom package),
// plan requests from the app (create, dedupe, approve, reject, emails) and
// the daily license job (trials, renewals, expired codes, 30-day purge).
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('plans, requests and license job', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let guard: typeof import('@/server/admin/guard');
  let aaudit: typeof import('@/server/admin/audit');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, guard, aaudit, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/admin/guard'),
      import('@/server/admin/audit'),
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

  const owner = async () => {
    const boss = await signedIn('boss@kh.pt');
    await makeAdmin(boss.user.id, 'owner');
    return guard.checkAdmin({ ...boss, user: { ...boss.user, totpEnabled: true } }, 'plans', true);
  };
  const mails = async (kind: string) =>
    (await fs.readdir(outbox).catch(() => [] as string[])).filter((f) => f.includes(`-${kind}-`));

  it('plans: price, discount, trial, modules and FREE limits reach the clients; custom prices', async () => {
    const plansSvc = await import('@/server/admin/plans');
    const ent = await import('@/server/licensing/entitlements');
    const ctx = await owner();
    const user = await signedIn('ana@kh.pt', 'DEVELOPER');
    await plansSvc.updatePlan(ctx, 'DEVELOPER', { price: 11, disc: 25 });
    await plansSvc.updatePlan(ctx, 'DEVELOPER', { trialEnabled: true, trialDays: 21 });
    let dev = (await plansSvc.plansFull()).plans.find((p) => p.code === 'DEVELOPER')!;
    expect(dev).toMatchObject({ price: 11, disc: 25, trialDays: 21, clients: 1 });
    expect(await codeOf(plansSvc.updatePlan(ctx, 'CUSTOM', { price: 1 }))).toBe('not_found');
    // modules: the client sees the change at once
    expect((await ent.getEntitlements(user.tenant.id)).modules).not.toContain('codelib');
    await plansSvc.setPlanModules(ctx, 'DEVELOPER', [...dev.modules, 'codelib', 'nope']);
    expect((await ent.getEntitlements(user.tenant.id)).modules).toContain('codelib');
    dev = (await plansSvc.plansFull()).plans.find((p) => p.code === 'DEVELOPER')!;
    expect(dev.modules).not.toContain('nope');
    // FREE limits (empty = unlimited)
    await plansSvc.setLimits(ctx, 'FREE', { notes: 50, voice: null });
    const free = (await plansSvc.plansFull()).plans.find((p) => p.code === 'FREE')!;
    expect(free.limits.notes).toBe(50);
    expect(free.limits.voice).toBeUndefined();
    // custom package prices
    await plansSvc.setCustomPrices(ctx, { addon: { sap: 12, bogus: 99 }, customDisc: 15 });
    const full = await plansSvc.plansFull();
    expect(full.addon.sap).toBe(12);
    expect(full.addon).not.toHaveProperty('bogus');
    expect(full.customDisc).toBe(15);
    const acts = await aaudit.queryAudit({
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(acts.map((a) => a.action)).toEqual(
      expect.arrayContaining(['plan.update', 'plan.trial', 'plan.modules', 'plan.limits', 'plan.addon']),
    );
  });

  it('requests: create emails the admins and dedupes; approve applies plan + trial; reject emails the reason', async () => {
    const req = await import('@/server/plans/requests');
    const plansSvc = await import('@/server/admin/plans');
    const ctx = await owner();
    // trials are off until the console turns them on
    await plansSvc.updatePlan(ctx, 'PRO', { trialEnabled: true, trialDays: 14 });
    const ana = await signedIn('ana@kh.pt', 'FREE');
    await admin.unsafe(`update tenants set seats = 3, kind = 'pack' where id = '${ana.tenant.id}'`);
    const view = await req.pricingFor(ana);
    expect(view.seats).toBe(3);
    expect(view.current).toBe('FREE');
    expect(view.plans.map((p) => p.code)).not.toContain('CUSTOM');
    expect(
      await codeOf(req.createRequest(ana, { kind: 'plan', plan: 'FREE', seats: 1, cycle: 'monthly' })),
    ).toBe('current_plan');
    const id = await req.createRequest(ana, { kind: 'plan', plan: 'PRO', seats: 1, cycle: 'annual' });
    expect((await req.listRequests()).find((r) => r.id === id)!.seats).toBe(3);
    expect(await req.createRequest(ana, { kind: 'plan', plan: 'PRO', seats: 1, cycle: 'annual' })).toBe(id);
    expect(await mails('planRequest')).toHaveLength(1);
    expect((await req.pricingFor(ana)).pending).toEqual([{ kind: 'plan', plan: 'PRO' }]);
    const custom = await req.createRequest(ana, {
      kind: 'custom',
      groups: ['sap'],
      seats: 4,
      cycle: 'monthly',
    });
    let rows = await req.listRequests();
    expect(rows.find((r) => r.id === custom)).toMatchObject({
      plan: 'CUSTOM',
      groups: ['base', 'sap'],
      seats: 4,
    });

    // approve: FREE → PRO with a trial
    await req.approveRequest(ctx, id, null);
    const [t] = await admin.unsafe(
      `select t.status, t.trial_ends_at, t.billing_cycle, t.seats, p.code from tenants t join plans p on p.id = t.plan_id where t.id = '${ana.tenant.id}'`,
    );
    // a plan change keeps the pack's seats (whatever the window sent)
    expect(t).toMatchObject({ status: 'trial', billing_cycle: 'annual', code: 'PRO', seats: 3 });
    expect(t!.trial_ends_at).not.toBeNull();
    expect(await mails('planApproved')).toHaveLength(1);
    expect(await codeOf(req.approveRequest(ctx, id, null))).toBe('already_handled');

    // reject: the reason goes in the email
    await req.rejectRequest(ctx, custom, 'Falta o contrato', null);
    const [rj] = await mails('planRejected');
    expect(JSON.parse(await fs.readFile(path.join(outbox, rj!), 'utf8')).text).toContain('Falta o contrato');
    rows = await req.listRequests();
    expect(rows.find((r) => r.id === custom)).toMatchObject({ status: 'rejected', handledBy: 'boss' });
    const acts = await aaudit.queryAudit({
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(acts.map((a) => a.action)).toEqual(
      expect.arrayContaining(['request.create', 'request.approve', 'request.reject']),
    );
  });

  it('license job: trial end and missed renewal suspend, reminders, expired codes, 30-day purge', async () => {
    const { runLicenseJob } = await import('@/server/jobs/licenses');
    const DAY = 86_400_000;
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const trial = await signedIn('trial@kh.pt', 'PRO');
    const late = await signedIn('late@kh.pt', 'PRO');
    const gone = await signedIn('gone@kh.pt', 'PRO');
    const soon = await signedIn('soon@kh.pt', 'SAP');
    const free = await signedIn('free@kh.pt', 'FREE');
    await admin.unsafe(
      `update tenants set status = 'trial', trial_ends_at = '${iso(-DAY)}' where id = '${trial.tenant.id}'`,
    );
    await admin.unsafe(
      `update tenants set status = 'active', renew_at = '${iso(-DAY)}' where id = '${late.tenant.id}'`,
    );
    await admin.unsafe(
      `update tenants set status = 'past_due', renew_at = '${iso(-8 * DAY)}' where id = '${gone.tenant.id}'`,
    );
    await admin.unsafe(
      `update tenants set status = 'active', renew_at = '${iso(2.5 * DAY)}' where id = '${soon.tenant.id}'`,
    );
    await admin.unsafe(
      `update tenants set status = 'active', renew_at = '${iso(-DAY)}' where id = '${free.tenant.id}'`,
    );
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await admin.unsafe(`update codes set expires_at = '${iso(-DAY)}' where code = '${c.code}'`);
    // a revoked invite 31 days ago: its person and their individual client go
    const old = await signedIn('old@kh.pt', 'PRO');
    await admin.unsafe(
      `update codes set status = 'revoked', revoked_at = '${iso(-31 * DAY)}' where id = (select registered_with_code_id from users where id = '${old.user.id}')`,
    );
    const out = await runLicenseJob();
    const st = async (id: string) =>
      (await admin.unsafe(`select status from tenants where id = '${id}'`))[0]?.status;
    expect(await st(trial.tenant.id)).toBe('suspended');
    expect(await st(late.tenant.id)).toBe('past_due');
    expect(await st(gone.tenant.id)).toBe('suspended');
    expect(await st(soon.tenant.id)).toBe('active');
    expect(await st(free.tenant.id)).toBe('active'); // free plans never fall behind
    expect(await st(old.tenant.id)).toBeUndefined();
    expect(await admin.unsafe(`select 1 from users where id = '${old.user.id}'`)).toHaveLength(0);
    const [cs] = await admin.unsafe(`select status from codes where code = '${c.code}'`);
    expect(cs!.status).toBe('expired');
    expect(out).toMatchObject({ suspended: 2, pastDue: 1, codesExpired: 1 });
    expect(await mails('renewalReminder')).toHaveLength(1);
    const acts = await aaudit.queryAudit({
      from: new Date(Date.now() - 3600_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(acts.map((a) => a.action)).toEqual(expect.arrayContaining(['tenant.expired', 'tenant.purged']));
  });
});
