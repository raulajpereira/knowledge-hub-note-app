import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Fase 11.1: deleting one's own account (RGPD) — recent password check, the
// Manager can't, the last admin of a pack hands over the role, an individual
// client goes with its person — and the admin IP allowlist / captcha rules.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('account deletion and access rules', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
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

  const mails = async (kind: string) =>
    (await fs.readdir(outbox).catch(() => [] as string[])).filter((f) => f.includes(`-${kind}-`));

  it('delete account: needs a recent password check; individual client goes with it; email + audit', async () => {
    const account = await import('@/server/account');
    const ana = await signedIn('ana@kh.pt', 'PRO');
    expect(
      await codeOf(
        account.deleteAccount({ ...ana, reauthAt: new Date(Date.now() - 10 * 60_000) }, { ip: null }),
      ),
    ).toBe('reauth_required');
    await account.deleteAccount(ana, { ip: '203.0.113.9' });
    expect(await admin.unsafe(`select 1 from users where id = '${ana.user.id}'`)).toHaveLength(0);
    expect(await admin.unsafe(`select 1 from tenants where id = '${ana.tenant.id}'`)).toHaveLength(0);
    expect(await mails('accountDeleted')).toHaveLength(1);
    const [a] = await admin.unsafe(
      `select actor_user_id, action from audit_log where action = 'account.deleted' and target_id = '${ana.user.id}'`,
    );
    expect(a!.actor_user_id).toBe(ana.user.id);
    // the sessions go with the person
    expect(await admin.unsafe(`select 1 from sessions where user_id = '${ana.user.id}'`)).toHaveLength(0);
  });

  it('delete account: the last admin of a pack hands the role over; the pack stays; the Manager cannot', async () => {
    const account = await import('@/server/account');
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 3 });
    const reg = async (email: string) => {
      await svc.register(
        { name: email.split('@')[0]!, email, password: 'Correct-Horse-9', code: c.code },
        meta,
      );
      const safe = email.replace(/[^a-z0-9@.]/gi, '_');
      const f = (await fs.readdir(outbox)).filter((x) => x.includes('-verify-') && x.includes(safe));
      const m = JSON.parse(await fs.readFile(path.join(outbox, f.at(-1)!), 'utf8')) as { text: string };
      await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(m.text)![1]!);
      const l = await svc.login({ email, password: 'Correct-Horse-9', remember: false }, meta);
      if (!('token' in l)) throw new Error('2FA not expected');
      return (await session.resolveSession(l.token))!;
    };
    const boss = await reg('boss@pack.pt');
    await reg('rui@pack.pt');
    await reg('eva@pack.pt');
    await account.deleteAccount(boss, { ip: null });
    const people = await admin.unsafe(
      `select email, role_in_tenant from users where tenant_id = '${boss.tenant.id}' order by created_at`,
    );
    expect(people.map((p) => [p.email, p.role_in_tenant])).toEqual([
      ['rui@pack.pt', 'admin'],
      ['eva@pack.pt', 'member'],
    ]);
    expect(await admin.unsafe(`select 1 from tenants where id = '${boss.tenant.id}'`)).toHaveLength(1);

    const mgr = await signedIn('mgr@kh.pt');
    await makeAdmin(mgr.user.id, 'owner');
    expect(await codeOf(account.deleteAccount(mgr, { ip: null }))).toBe('manager_account');
  });

  it('admin IP allowlist and captcha rules', async () => {
    const { ipAllowed } = await import('@/server/admin/guard');
    expect(ipAllowed('203.0.113.7', '')).toBe(true);
    expect(ipAllowed('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.7', '203.0.113.0/24')).toBe(true);
    expect(ipAllowed('203.0.114.7', '203.0.113.0/24, 10.0.0.1')).toBe(false);
    expect(ipAllowed('10.0.0.1', '203.0.113.0/24, 10.0.0.1')).toBe(true);
    expect(ipAllowed('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipAllowed(null, '10.0.0.0/8')).toBe(false);
    expect(ipAllowed('2001:db8::1', '2001:db8::1')).toBe(true);
    expect(ipAllowed('10.0.0.1', '10.0.0.0/33')).toBe(false);
    // without Turnstile keys the login never asks for a captcha (lockout only)
    const { captchaNeeded } = await import('@/server/auth/captcha');
    expect(await captchaNeeded(5, 2, '203.0.113.9')).toBe(false);
    // and failed sign-ins still lock
    for (let i = 0; i < 5; i++)
      await codeOf(svc.login({ email: 'nobody@kh.pt', password: 'x', remember: false }, meta));
    expect(await codeOf(svc.login({ email: 'nobody@kh.pt', password: 'x', remember: false }, meta))).toBe(
      'locked',
    );
  });
});
