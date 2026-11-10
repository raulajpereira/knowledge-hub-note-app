import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Web Push through the real services, as kh_app under RLS: subscriptions are
// each person's own, the worker claims only new notifications (never old
// ones, never twice), sends the bell's words with the item's address, and a
// subscription the push service no longer knows (410) is dropped. The push
// service itself is a fake (web-push mocked).
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.19', userAgent: 'vitest', lang: 'pt' as const };
// fake values: web-push is mocked below, nothing is signed with them
process.env.VAPID_PUBLIC_KEY =
  'BNbxGYNMhEIi9zrneh7mqV4oUanjLUK3m+mYZBc62frMKrEoMk88r3Lk596T0ck9xlT+aok0fO1KXBLV4+XqxYM=';
process.env.VAPID_PRIVATE_KEY = 'TVe_nJlciDOn130gFyFYP8UiGxxWd3QdH6C5axXpSgM';
process.env.VAPID_SUBJECT = 'mailto:push-test@example.com';

const sent: Array<{ endpoint: string; payload: { title: string; body: string; url: string; tag: string } }> =
  [];
const gone = new Set<string>();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (gone.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    },
  },
}));

describe.skipIf(!enabled)('web push', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let ns: typeof import('@/server/notify/service');
  let push: typeof import('@/server/notify/push');
  let tenant: typeof import('@/server/content/tenant');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, ns, push, tenant, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/notify/service'),
      import('@/server/notify/push'),
      import('@/server/content/tenant'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE push_subscriptions, notifications, notify_settings, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
    sent.length = 0;
    gone.clear();
  });

  afterAll(async () => {
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function signedIn(email: string, password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
  const notify = (a: Awaited<ReturnType<typeof signedIn>>, title: string, key: string) =>
    tenant.asUser(a, (tx) =>
      ns.addNotification(
        tx,
        { tenantId: a.tenant.id, userId: a.user.id },
        { kind: 'task_due', itemType: 'task', itemId: '0190a0a0-0000-7000-8000-000000000001', title, key },
      ),
    );

  it('user_prefs is each person’s own under RLS (0059): another user id sees and changes nothing', async () => {
    const prefs = await import('@/server/prefs');
    const { sql } = await import('drizzle-orm');
    const ana = await signedIn('ana@prefs.pt');
    const rui = await signedIn('rui@prefs.pt');
    await prefs.patchPrefs(ana.user.id, { theme: 'light' }, new Set());
    expect((await prefs.getPrefs(ana.user.id)).theme).toBe('light');
    expect((await prefs.getPrefs(rui.user.id)).theme).toBeUndefined();
    // as kh_app with Rui's id, Ana's row is invisible and can't be changed
    const seen = await dbm.db().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${rui.user.id}, true)`);
      const n = (await tx.execute(
        sql`select count(*)::int n from user_prefs where user_id = ${ana.user.id}`,
      )) as unknown as Array<{ n: number }>;
      const u = (await tx.execute(
        sql`update user_prefs set data = '{}' where user_id = ${ana.user.id} returning 1`,
      )) as unknown as unknown[];
      return { n: n[0]!.n, u: u.length };
    });
    expect(seen).toEqual({ n: 0, u: 0 });
    // and without any user id, nothing at all
    const none = (await dbm.db().execute(sql`select count(*)::int n from user_prefs`)) as unknown as Array<{
      n: number;
    }>;
    expect(none[0]!.n).toBe(0);
    expect((await prefs.getPrefs(ana.user.id)).theme).toBe('light');
  });

  it('sends new notifications once, to each person’s own devices, with the bell’s words', async () => {
    expect(push.pushConfigured()).toBe(true);
    const ana = await signedIn('ana@push.pt');
    const rui = await signedIn('rui@push.pt');
    await push.subscribe(ana, {
      endpoint: 'https://push.example.com/ana-phone',
      ...keys,
      device: 'Chrome · Android',
    });
    await push.subscribe(ana, {
      endpoint: 'https://push.example.com/ana-pc',
      ...keys,
      device: 'Edge · Windows',
    });
    await push.subscribe(rui, { endpoint: 'https://push.example.com/rui', ...keys, device: 'Safari · iOS' });
    // each person sees only their own devices
    expect((await push.listDevices(ana)).map((d) => d.device).sort()).toEqual([
      'Chrome · Android',
      'Edge · Windows',
    ]);
    expect((await push.listDevices(rui)).map((d) => d.device)).toEqual(['Safari · iOS']);

    // a notification older than 15 minutes is never sent late
    await notify(ana, 'Antiga', 'old');
    await admin.unsafe(
      `UPDATE notifications SET created_at = now() - interval '20 minutes' WHERE title = 'Antiga'`,
    );
    await notify(ana, 'Fechar SM37', 'k1');
    const r = await push.runPush();
    expect(r).toMatchObject({ claimed: 1, sent: 2, gone: 0 });
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      'https://push.example.com/ana-pc',
      'https://push.example.com/ana-phone',
    ]);
    expect(sent[0]!.payload).toMatchObject({
      title: 'Tarefa para hoje',
      body: 'Fechar SM37',
      url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/tasks?t=0190a0a0-0000-7000-8000-000000000001`,
    });
    // again: nothing new
    expect(await push.runPush()).toMatchObject({ claimed: 0 });

    // a gone device is dropped; the other one still gets it
    gone.add('https://push.example.com/ana-pc');
    sent.length = 0;
    await notify(ana, 'Relatório', 'k2');
    expect(await push.runPush()).toMatchObject({ claimed: 1, sent: 1, gone: 1 });
    expect((await push.listDevices(ana)).map((d) => d.device)).toEqual(['Chrome · Android']);

    // turned off: nothing more
    await push.unsubscribe(ana, { endpoint: 'https://push.example.com/ana-phone' });
    sent.length = 0;
    await notify(ana, 'Outra', 'k3');
    await push.runPush();
    expect(sent).toHaveLength(0);
  });

  it('a browser used by someone else becomes the new person’s; bad endpoints are refused', async () => {
    const ana = await signedIn('ana2@push.pt');
    const rui = await signedIn('rui2@push.pt');
    await push.subscribe(ana, { endpoint: 'https://push.example.com/shared', ...keys, device: 'Chrome' });
    await push.subscribe(rui, { endpoint: 'https://push.example.com/shared', ...keys, device: 'Chrome' });
    expect(await push.listDevices(ana)).toHaveLength(0);
    expect(await push.listDevices(rui)).toHaveLength(1);
    for (const endpoint of [
      'http://push.example.com/x',
      'https://127.0.0.1/x',
      'https://localhost/x',
      'nope',
    ])
      await expect(push.subscribe(ana, { endpoint, ...keys, device: '' })).rejects.toMatchObject({
        code: 'validation',
      });
  });
});
