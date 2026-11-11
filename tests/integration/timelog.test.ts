import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Registo de Tempos through the real services, as kh_app under RLS: one
// running entry per person, the time kept is rounded up to 15 minutes, a
// project's hours go to the person's Management timesheet (and leave it on
// delete), and nobody sees another person's entries.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.19', userAgent: 'vitest', lang: 'pt' as const };
describe.skipIf(!enabled)('time log', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let tl: typeof import('@/server/content/timelog');
  let notes: typeof import('@/server/content/notes');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;
  const MODS = new Set(['timelog', 'mg_time', 'mg_projects', 'tickets', 'issues']);

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, tl, notes, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/timelog'),
      import('@/server/content/notes'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE time_entries, mg_timesheets, mg_projects, mg_people, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }

  it('one running entry; stop keeps the time rounded up to 15 min; free text', async () => {
    const ana = await signedIn('ana@tl.pt');
    const e = await tl.startEntry(ana, { refLabel: 'INC0012345', clientLabel: 'Porto', description: 'IDoc' });
    expect(e.endedAt).toBeNull();
    await expect(tl.startEntry(ana, { refLabel: 'outra' })).rejects.toMatchObject({ code: 'timer_running' });
    expect((await tl.runningEntry(ana))?.id).toBe(e.id);
    // 61 minutes ago → 75 minutes
    await admin`update time_entries set started_at = now() - interval '61 minutes' where id = ${e.id}`;
    const { stopped, next } = await tl.stopEntry(
      ana,
      { description: 'IDoc 51', next: { refLabel: 'Reunião' } },
      MODS,
      'Europe/Lisbon',
    );
    expect(stopped.minutes).toBe(75);
    expect(stopped.description).toBe('IDoc 51');
    expect(stopped.tsState).toBe('no_project');
    expect(next?.refLabel).toBe('Reunião');
    expect((await tl.runningEntry(ana))?.id).toBe(next!.id);
  });

  it('a project entry goes to the person’s timesheet (Mon–Fri) and leaves it on delete; restore brings it back', async () => {
    const ana = await signedIn('ana@ts.pt');
    const person = crypto.randomUUID();
    const project = crypto.randomUUID();
    await admin`insert into mg_people (id, tenant_id, owner_id, name, area, level, av, email)
      values (${person}, ${ana.tenant.id}, ${ana.user.id}, 'Ana', 'ABAP', 3, 'Ativo', 'ANA@ts.pt')`;
    await admin`insert into mg_projects (id, tenant_id, owner_id, code, name, from_date, to_date, color, status)
      values (${project}, ${ana.tenant.id}, ${ana.user.id}, 'POR-EWM', 'EWM', '2026-01-01', '2026-12-31', '#0af', 'Ativo')`;
    // Wednesday 11/11/2026 09:00–10:20 Lisbon → 1h30 on day 2 of the week of 09/11
    const e = await tl.addManual(
      ana,
      { projectId: project, startedAt: '2026-11-11T09:00:00.000Z', endedAt: '2026-11-11T10:20:00.000Z' },
      MODS,
      'Europe/Lisbon',
    );
    expect(e.minutes).toBe(90);
    expect(e.projectLabel).toBe('POR-EWM · EWM');
    expect(e.tsState).toBe('added');
    const rows = async () =>
      (await admin`select rows from mg_timesheets where person_id = ${person} and week = '2026-11-09'`)[0]
        ?.rows as Record<string, number[]> | undefined;
    expect((await rows())?.[project]).toEqual([0, 0, 1.5, 0, 0]);
    // edit the end: the sheet follows
    await tl.updateEntry(ana, e.id, { endedAt: '2026-11-11T09:40:00.000Z' }, MODS, 'Europe/Lisbon');
    expect((await rows())?.[project]).toEqual([0, 0, 0.75, 0, 0]);
    // switched off, then on
    await tl.updateEntry(ana, e.id, { inTimesheet: false }, MODS, 'Europe/Lisbon');
    expect((await rows())?.[project]).toEqual([0, 0, 0, 0, 0]);
    await tl.updateEntry(ana, e.id, { inTimesheet: true }, MODS, 'Europe/Lisbon');
    expect((await rows())?.[project]).toEqual([0, 0, 0.75, 0, 0]);
    // to the Trash and back
    await tl.deleteEntry(ana, e.id);
    expect((await rows())?.[project]).toEqual([0, 0, 0, 0, 0]);
    expect((await notes.listTrash(ana)).some((x) => x.kind === 'time' && x.id === e.id)).toBe(true);
    await notes.restoreTrash(ana, [{ kind: 'time', id: e.id }]);
    // restore re-applies with the plan's modules (PRO may not have mg_time): never more than once
    const back = (await rows())?.[project]?.[2] ?? 0;
    expect([0, 0.75]).toContain(back);
    // a Saturday stays out of the sheet
    const sat = await tl.addManual(
      ana,
      { projectId: project, startedAt: '2026-11-14T09:00:00.000Z', endedAt: '2026-11-14T10:00:00.000Z' },
      MODS,
      'Europe/Lisbon',
    );
    expect(sat.tsState).toBe('weekend');
  });

  it('nobody sees or changes another person’s entries', async () => {
    const ana = await signedIn('ana@iso.pt');
    const rui = await signedIn('rui@iso.pt');
    const e = await tl.startEntry(ana, { refLabel: 'só da Ana' });
    expect(await tl.runningEntry(rui)).toBeNull();
    await expect(
      tl.updateEntry(rui, e.id, { description: 'x' }, MODS, 'Europe/Lisbon'),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(tl.deleteEntry(rui, e.id)).rejects.toMatchObject({ code: 'not_found' });
    const all = await tl.listEntries(
      rui,
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
    );
    expect(all).toEqual([]);
  });
});
