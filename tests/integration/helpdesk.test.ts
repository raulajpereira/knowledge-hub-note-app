import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Helpdesk through the real services, as kh_app under RLS: the extension's
// token (scope 'ext') only works for it and the cookie's never does; a read
// becomes tickets, the next one changes (fields, comment, gone) with one
// notification; nobody sees another person's helpdesk.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.39', userAgent: 'vitest', lang: 'pt' as const };
const H = ['Assunto', 'Estado', 'Prioridade', 'Reportado por', 'Último comentário', 'Cliente'];
const row = (n: string, st: string, pr = 'Média', c = '') => [
  `#${n} Ticket ${n}`,
  st,
  pr,
  'Ana (16/11/2026 11:20)',
  c,
  'Cliente A',
];
const URL1 = 'https://helpdesk.example/my-page';

describe.skipIf(!enabled)('helpdesk', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let hd: typeof import('@/server/helpdesk');
  let ws: typeof import('@/server/workspaces');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, hd, ws, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/helpdesk'),
      import('@/server/workspaces'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE helpdesk_changes, helpdesk_items, helpdesk_sources, notifications, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  async function signedIn(email: string, plan = 'SAP', password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: plan, maxUses: 1 });
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return { auth: (await session.resolveSession(a.token))!, cookie: a.token };
  }
  const bearer = (t: string) => new Request('http://x', { headers: { authorization: `Bearer ${t}` } });

  it('in the SAP plans only; the extension token is its own', async () => {
    const { auth, cookie } = await signedIn('ana@hd.pt');
    expect((await ws.entitlementsFor(auth)).modules).toContain('helpdesk');
    const pro = await signedIn('rui@hd.pt', 'PRO');
    expect((await ws.entitlementsFor(pro.auth)).modules).not.toContain('helpdesk');
    const { token } = await hd.pairExtension(auth, { ip: null });
    expect((await hd.extAuth(bearer(token))).user.id).toBe(auth.user.id);
    // the extension's token is not a cookie, the cookie is not the extension's token
    expect(await session.resolveSession(token)).toBeNull();
    await expect(hd.extAuth(bearer(cookie))).rejects.toMatchObject({ code: 'unauthenticated' });
    const p2 = await hd.pairExtension(pro.auth, { ip: null });
    await expect(hd.extAuth(bearer(p2.token))).rejects.toMatchObject({ code: 'module_not_included' });
  });

  it('link → first import → reads with changes, comment, gone and back; one notification per read', async () => {
    const { auth } = await signedIn('ana@hd2.pt');
    const s = await hd.receiveSnapshot(auth, {
      url: URL1,
      title: 'Minha página',
      headers: H,
      rows: [row('1', 'Aberto'), row('2', 'Aberto'), ['Total', '', '', '', '', '']],
    });
    expect(s.active).toBe(false);
    expect(await hd.extSources(auth)).toEqual([]);
    const src = await hd.getSource(auth, s.id);
    expect(src.mapping).toMatchObject({ Assunto: 'subject', Estado: 'status', Cliente: 'client' });
    const pv = await hd.previewSource(auth, s.id, src.mapping);
    expect(pv.counts).toEqual({ fresh: 2, changed: 0, same: 0, gone: 0 });
    expect(pv.skipped).toBe(1);
    expect(await hd.importSource(auth, s.id, { intervalMin: 15 })).toMatchObject({ created: 2 });
    expect(await hd.unseenChanges(auth)).toEqual([]); // the first import is not news
    expect((await hd.extSources(auth)).map((x) => x.url)).toEqual([URL1]);

    const r = await hd.syncSource(auth, s.id, {
      url: URL1,
      headers: H,
      rows: [row('1', 'Em progresso', 'Alta', 'Rui (17/11/2026 09:00)'), row('3', 'Aberto')],
    });
    expect(r).toMatchObject({ ok: true, created: 1, updated: 1, gone: 1 });
    const ch = await hd.unseenChanges(auth);
    expect(ch.map((c) => [c.number, c.kind, c.field, c.from, c.to]).sort()).toEqual(
      [
        ['1', 'comment', '', 'Rui', '2026-11-17 09:00'],
        ['1', 'field', 'priority', 'Média', 'Alta'],
        ['1', 'field', 'status', 'Aberto', 'Em progresso'],
        ['2', 'gone', '', '', ''],
        ['3', 'new', '', '', 'Aberto'],
      ].sort(),
    );
    const n = await admin`select kind, meta->>'n' as n from notifications`;
    expect(n).toEqual([{ kind: 'helpdesk', n: '3' }]);
    await hd.markSeen(auth, 'all');
    expect(await hd.unseenChanges(auth)).toEqual([]);

    // the same read again: nothing new, no notification
    await hd.syncSource(auth, s.id, {
      url: URL1,
      headers: H,
      rows: [row('1', 'Em progresso', 'Alta', 'Rui (17/11/2026 09:00)'), row('3', 'Aberto')],
    });
    expect(await hd.unseenChanges(auth)).toEqual([]);
    // back in the list
    await hd.syncSource(auth, s.id, {
      url: URL1,
      headers: H,
      rows: [
        row('1', 'Em progresso', 'Alta', 'Rui (17/11/2026 09:00)'),
        row('2', 'Aberto'),
        row('3', 'Aberto'),
      ],
    });
    expect((await hd.unseenChanges(auth)).map((c) => c.kind)).toEqual(['back']);
    // an empty page where there were tickets: not "everything left"
    expect(await hd.syncSource(auth, s.id, { url: URL1, headers: H, rows: [] })).toEqual({
      ok: false,
      error: 'no_table',
    });
    expect((await hd.overview(auth)).items.every((i) => i.inList)).toBe(true);
    // the helpdesk asks to sign in again
    expect(await hd.syncSource(auth, s.id, { error: 'session' })).toEqual({ ok: false, error: 'session' });
    expect((await hd.getSource(auth, s.id)).lastError).toBe('session');
    expect(
      (await admin`select count(*)::int as n from notifications where meta->>'error' = 'session'`)[0]!.n,
    ).toBe(1);
  });

  it('nobody sees another person’s helpdesk', async () => {
    const ana = (await signedIn('ana@hd3.pt')).auth;
    const rui = (await signedIn('rui@hd3.pt')).auth;
    const s = await hd.receiveSnapshot(ana, { url: URL1, headers: H, rows: [row('1', 'Aberto')] });
    await hd.importSource(ana, s.id, {});
    expect((await hd.overview(rui)).items).toEqual([]);
    await expect(hd.getSource(rui, s.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(hd.syncSource(rui, s.id, { url: URL1, headers: H, rows: [] })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
