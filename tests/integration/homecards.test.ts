import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Início: the data of the cards added later (Notas SAP, Cutover e Testes,
// Ficheiros, Notas de voz), through the real query as kh_app under RLS.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.39', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('home cards data', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let home: typeof import('@/server/content/home');
  let ws: typeof import('@/server/workspaces');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, home, ws, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/home'),
      import('@/server/workspaces'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE sap_note_systems, sap_notes, sap_systems, sap_fn_records, notifications, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  it('SAP notes to implement per system, cutover / tests progress, empty lists', async () => {
    const { auth } = await signedIn('ana@home.pt');
    const mods = new Set((await ws.entitlementsFor(auth)).modules);
    expect(mods.has('sapnotes')).toBe(true);
    const empty = await home.homeData(auth, mods);
    expect(empty.sapNotes).toEqual({ todo: 0, done: 0, list: [] });
    expect(empty.files).toEqual([]);
    const sys = crypto.randomUUID();
    const n1 = crypto.randomUUID();
    const n2 = crypto.randomUUID();
    const t = auth.tenant.id;
    await admin`insert into sap_systems (id, tenant_id, name, sid) values (${sys}, ${t}, 'Desenvolvimento', 'DEV')`;
    await admin`insert into sap_notes (id, tenant_id, number, title) values (${n1}, ${t}, 3412345, 'Correção payroll'), (${n2}, ${t}, 3401122, 'SF Learning')`;
    await admin`insert into sap_note_systems (tenant_id, note_id, system_id, status) values (${t}, ${n1}, ${sys}, 'todo'), (${t}, ${n2}, ${sys}, 'done')`;
    const d = await home.homeData(auth, mods);
    expect(d.sapNotes).toEqual({
      todo: 1,
      done: 1,
      list: [{ id: n1, number: 3412345, title: 'Correção payroll', systems: ['DEV'] }],
    });
    expect(d.fn).toEqual({
      cut: { total: 0, done: 0, bad: 0 },
      test: { total: 0, done: 0, bad: 0 },
      mig: { total: 0, done: 0, bad: 0 },
    });
  });
});
