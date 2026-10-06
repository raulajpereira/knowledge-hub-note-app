import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Phase 3.1: synced preferences and the "Conta e Dados" actions through the
// real services (Postgres + Redis).
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('prefs and account', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let prefs: typeof import('@/server/prefs');
  let account: typeof import('@/server/account');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, prefs, account, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/prefs'),
      import('@/server/account'),
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

  async function signedIn(email: string, password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await svc.register({ name: 'Ana Teste', email, password, code: c.code }, meta);
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-'));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    const auth = await session.resolveSession(a.token);
    return { auth: auth!, token: a.token };
  }

  it('prefs: merge-patch per key, null removes, unknown keys refused, survives a new session', async () => {
    const { auth } = await signedIn('ana@prefs.pt');
    expect(await prefs.getPrefs(auth.user.id)).toEqual({});
    await prefs.patchPrefs(auth.user.id, { cols: { side: 300 } });
    // A second "device" changes another key: the first one is kept.
    await prefs.patchPrefs(auth.user.id, { 'ui.issues.cols': { title: 220 } });
    expect(await prefs.getPrefs(auth.user.id)).toEqual({
      cols: { side: 300 },
      'ui.issues.cols': { title: 220 },
    });
    await prefs.patchPrefs(auth.user.id, { 'ui.issues.cols': null });
    expect(await prefs.getPrefs(auth.user.id)).toEqual({ cols: { side: 300 } });
    await expect(prefs.patchPrefs(auth.user.id, { role: 'owner' })).rejects.toMatchObject({
      status: 400,
      code: 'pref_unknown_key',
    });
    const again = await svc.login(
      { email: 'ana@prefs.pt', password: 'Correct-Horse-9', remember: false },
      meta,
    );
    const other = await session.resolveSession('token' in again ? again.token : '');
    expect(await prefs.getPrefs(other!.user.id)).toEqual({ cols: { side: 300 } });
  });

  it('change password: needs the current one, ends the other sessions, keeps this one, emails', async () => {
    const first = await signedIn('rui@pw.pt');
    const second = await svc.login(
      { email: 'rui@pw.pt', password: 'Correct-Horse-9', remember: false },
      meta,
    );
    const secondToken = 'token' in second ? second.token : '';
    expect(await session.resolveSession(secondToken)).not.toBeNull();

    await expect(
      account.changePassword(first.auth, { current: 'wrong-one', next: 'New-Horse-2026' }, meta),
    ).rejects.toMatchObject({ code: 'bad_credentials' });
    await expect(
      account.changePassword(first.auth, { current: 'Correct-Horse-9', next: 'short' }, meta),
    ).rejects.toMatchObject({ code: 'password_too_short' });

    await account.changePassword(first.auth, { current: 'Correct-Horse-9', next: 'New-Horse-2026' }, meta);
    expect(await session.resolveSession(first.token)).not.toBeNull();
    expect(await session.resolveSession(secondToken)).toBeNull();
    const changed = (await fs.readdir(outbox)).filter((f) => f.includes('-changed-'));
    expect(changed).toHaveLength(1);
    const relog = await svc.login({ email: 'rui@pw.pt', password: 'New-Horse-2026', remember: false }, meta);
    expect('token' in relog).toBe(true);
  });

  it('sessions: list marks the current one; end one / end others; never another user’s', async () => {
    const a = await signedIn('eva@s.pt');
    await svc.login({ email: 'eva@s.pt', password: 'Correct-Horse-9', remember: false }, meta);
    await svc.login({ email: 'eva@s.pt', password: 'Correct-Horse-9', remember: false }, meta);
    let list = await account.listSessions(a.auth);
    expect(list).toHaveLength(3);
    expect(list[0]!.current).toBe(true);
    await expect(account.endSession(a.auth, a.auth.sessionId)).rejects.toMatchObject({
      code: 'current_session',
    });

    const b = await signedIn('zeca@s.pt');
    await expect(account.endSession(b.auth, list[1]!.id)).rejects.toMatchObject({ status: 404 });

    await account.endSession(a.auth, list[1]!.id);
    list = await account.listSessions(a.auth);
    expect(list).toHaveLength(2);
    expect(await account.endOtherSessions(a.auth)).toBe(1);
    expect(await account.listSessions(a.auth)).toHaveLength(1);
  });

  it('profile name and export', async () => {
    const { auth } = await signedIn('lia@x.pt');
    await account.updateProfile(auth, { name: 'Lia Nova' });
    await prefs.patchPrefs(auth.user.id, { cols: { side: 250 } });
    const fresh = await session.resolveSession(
      (
        (await svc.login({ email: 'lia@x.pt', password: 'Correct-Horse-9', remember: false }, meta)) as {
          token: string;
        }
      ).token,
    );
    expect(fresh!.user.name).toBe('Lia Nova');
    const data = await account.exportData(fresh!);
    expect(data.user).toMatchObject({ name: 'Lia Nova', email: 'lia@x.pt', twoFactor: false });
    expect(data.prefs).toEqual({ cols: { side: 250 } });
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|argon2|tokenHash/);
  });
});
