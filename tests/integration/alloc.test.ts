import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AuthContext } from '@/server/auth/session';
import { AL_MASK_WK, bookingSeries, dnOf, isoOf, type Booking, type CalcEnv } from '@/lib/alloc';

// Alocações v2 through the real services, as kh_app under RLS: each manager
// sees only their own Management data (two managers of the same account),
// clients stay shared; bookings by date range with typed days; batches with
// optimistic concurrency (409, nothing applied); the 0050 conversion of v1.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('alocações v2', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let mg: typeof import('@/server/content/mg');
  let al: typeof import('@/server/content/mgAlloc');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, mg, al, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/mg'),
      import('@/server/content/mgAlloc'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE mg_booking_days, mg_bookings, mg_absences, mg_requests, mg_timesheets, mg_allocs, mg_projects, mg_people, mg_teams, mg_settings, mg_clients, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  async function register(email: string, code: string) {
    await svc.register({ name: email.split('@')[0]!, email, password: 'Correct-Horse-9', code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password: 'Correct-Horse-9', remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  /** Two managers of the same account (a 2-seat MANAGEMENT licence). */
  async function twoManagers(): Promise<[AuthContext, AuthContext]> {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'MANAGEMENT', maxUses: 2 });
    const a = await register('gestora-a@acme.pt', c.code);
    const b = await register('gestor-b@acme.pt', c.code);
    expect(a.tenant.id).toBe(b.tenant.id);
    return [a, b];
  }
  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
  const bk = (o: Partial<Booking> & Pick<Booking, 'person' | 'project'>): Booking => ({
    id: crypto.randomUUID(),
    role: 'Consultor FI',
    status: 'confirmed',
    from: '2026-11-02',
    to: '2026-11-13',
    mode: 'hpd',
    value: 6,
    mask: AL_MASK_WK,
    hol: false,
    note: '',
    need: [],
    days: {},
    ver: '',
    ...o,
  });

  it('each manager sees only their own data; clients stay shared by the account', async () => {
    const [a, b] = await twoManagers();
    await mg.resetMgSample(a);
    const da = await mg.loadMg(a);
    expect([da.teams.length, da.people.length, da.projects.length, da.reqs.length]).toEqual([3, 38, 10, 6]);
    const ra = await al.loadAlloc(a, '2026-01-01', '2028-12-31');
    expect(ra.bookings.length).toBeGreaterThan(40);
    expect(ra.bookings.some((x) => !x.person && x.role)).toBe(true); // "Por atribuir"
    expect(ra.bookings.some((x) => x.status === 'tentative')).toBe(true);
    expect(ra.absences.length).toBeGreaterThan(5);

    // the other manager of the same account: no people, projects, teams, bookings or absences …
    const db = await mg.loadMg(b);
    expect([db.teams.length, db.people.length, db.projects.length, db.ts.length, db.reqs.length]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(db.settings).toEqual({});
    expect(await al.loadAlloc(b, '2026-01-01', '2028-12-31')).toMatchObject({ bookings: [], absences: [] });
    expect((await mg.mgOptions(b)).projects).toEqual([]);
    // … but the same clients
    expect(db.clients.map((c) => c.id).sort()).toEqual(da.clients.map((c) => c.id).sort());

    // and can't point at, change or delete A's rows
    const pA = da.people[0]!;
    const pjA = da.projects[0]!;
    expect(
      await codeOf(
        al.applyAlOps(b, [{ op: 'put', c: 'bk', v: bk({ person: pA.id, project: pjA.id }), base: '' }]),
      ),
    ).toBe('invalid_reference');
    const theirs = ra.bookings[0]!;
    expect(await codeOf(al.applyAlOps(b, [{ op: 'put', c: 'bk', v: theirs, base: theirs.ver }]))).toBe(
      'conflict',
    );
    expect(await codeOf(al.applyAlOps(b, [{ op: 'put', c: 'bk', v: theirs, base: '' }]))).toBe('conflict');
    await al.applyAlOps(b, [{ op: 'del', c: 'bk', id: theirs.id, base: theirs.ver }]);
    expect((await al.loadAlloc(a, theirs.from, theirs.to)).bookings.some((x) => x.id === theirs.id)).toBe(
      true,
    );
    await mg.applyMgOps(b, [{ op: 'del', c: 'people', id: pA.id }]);
    expect((await mg.loadMg(a)).people.some((x) => x.id === pA.id)).toBe(true);
    expect(await codeOf(mg.applyMgOps(b, [{ op: 'put', c: 'people', v: { ...pA, name: 'X' } }]))).not.toBe(
      'ok',
    );
    expect((await mg.loadMg(a)).people.find((x) => x.id === pA.id)?.name).toBe(pA.name);

    // B's own sample doesn't touch A's; settings are per manager
    await mg.resetMgSample(b);
    await mg.applyMgOps(b, [{ op: 'put', c: 'settings', v: { hiddenAreas: ['bw'] } }]);
    expect((await mg.loadMg(a)).people).toHaveLength(38);
    expect((await mg.loadMg(a)).settings).toEqual({});
    expect((await mg.loadMg(b)).settings).toEqual({ hiddenAreas: ['bw'] });
    expect((await mg.loadMg(b)).clients.length).toBe(da.clients.length); // reused by name
  });

  it('bookings by date range, typed days, batches with optimistic concurrency', async () => {
    const [a] = await twoManagers();
    await mg.resetMgSample(a);
    const d = await mg.loadMg(a);
    await admin`DELETE FROM mg_bookings`;
    await admin`DELETE FROM mg_absences`;
    const p = d.people[0]!.id;
    const pj = d.projects[0]!.id;
    const x = bk({ person: p, project: pj, days: { '2026-11-04': 2, '2026-12-20': 8 } });
    const ph = bk({
      person: '',
      project: pj,
      role: 'Developer ABAP',
      need: [{ k: 'abap', l: 2 }],
      from: '2027-01-04',
      to: '2027-01-29',
      status: 'tentative',
    });
    const v1 = await al.applyAlOps(a, [
      { op: 'put', c: 'bk', v: x, base: '' },
      { op: 'put', c: 'bk', v: ph, base: '' },
    ]);
    expect(Object.keys(v1).sort()).toEqual([x.id, ph.id].sort());
    // by range: only the overlapping ones; typed days outside the range are not kept
    let r = await al.loadAlloc(a, '2026-11-10', '2026-11-30');
    expect(r.bookings.map((b) => b.id)).toEqual([x.id]);
    expect(r.bookings[0]).toMatchObject({ days: { '2026-11-04': 2 }, ver: v1[x.id] });
    expect((await al.loadAlloc(a, '2026-12-01', '2027-01-04')).bookings.map((b) => b.id)).toEqual([ph.id]);
    expect((await al.loadAlloc(a, '2027-02-01', '2027-03-01')).bookings).toEqual([]);

    // an update on the version read; a stale one fails the whole batch
    const x2 = { ...x, from: '2026-11-03', to: '2026-11-20', days: { '2026-11-05': 3 } };
    const v2 = await al.applyAlOps(a, [{ op: 'put', c: 'bk', v: x2, base: v1[x.id]! }]);
    expect(v2[x.id]! > v1[x.id]!).toBe(true);
    const phMoved = { ...ph, from: '2027-02-01', to: '2027-02-26' };
    expect(
      await codeOf(
        al.applyAlOps(a, [
          { op: 'put', c: 'bk', v: phMoved, base: v1[ph.id]! },
          { op: 'put', c: 'bk', v: { ...x2, value: 1 }, base: v1[x.id]! },
        ]),
      ),
    ).toBe('conflict');
    r = await al.loadAlloc(a, '2026-01-01', '2027-12-31');
    expect(r.bookings.find((b) => b.id === ph.id)?.from).toBe('2027-01-04'); // nothing applied
    expect(r.bookings.find((b) => b.id === x.id)).toMatchObject({ value: 6, days: { '2026-11-05': 3 } });
    // delete: stale version refused, current one accepted, a second delete is fine
    expect(await codeOf(al.applyAlOps(a, [{ op: 'del', c: 'bk', id: x.id, base: v1[x.id]! }]))).toBe(
      'conflict',
    );
    await al.applyAlOps(a, [{ op: 'del', c: 'bk', id: x.id, base: v2[x.id]! }]);
    await al.applyAlOps(a, [{ op: 'del', c: 'bk', id: x.id, base: v2[x.id]! }]);
    expect((await admin`SELECT count(*)::int n FROM mg_booking_days`)[0]!.n).toBe(0);

    // invalid input refused; absences, also with a version
    expect(await codeOf(al.applyAlOps(a, [{ op: 'put', c: 'bk', v: { ...x, mask: 0 }, base: '' }]))).toBe(
      'invalid_input',
    );
    const ab = {
      id: crypto.randomUUID(),
      person: p,
      type: 'ferias' as const,
      from: '2026-12-21',
      to: '2026-12-31',
      hours: null,
      note: '',
      ver: '',
    };
    const va = await al.applyAlOps(a, [{ op: 'put', c: 'ab', v: ab, base: '' }]);
    expect((await al.loadAlloc(a, '2026-12-24', '2026-12-24')).absences).toMatchObject([
      { id: ab.id, type: 'ferias' },
    ]);
    await al.applyAlOps(a, [
      { op: 'put', c: 'ab', v: { ...ab, type: 'formacao', hours: 4 }, base: va[ab.id]! },
    ]);
    expect(await codeOf(al.applyAlOps(a, [{ op: 'put', c: 'ab', v: ab, base: va[ab.id]! }]))).toBe(
      'conflict',
    );
    // deleting a person removes their bookings and absences (FK)
    await al.applyAlOps(a, [{ op: 'put', c: 'bk', v: bk({ person: p, project: pj }), base: '' }]);
    await mg.applyMgOps(a, [{ op: 'del', c: 'people', id: p }]);
    r = await al.loadAlloc(a, '2026-01-01', '2027-12-31');
    expect(r.bookings.filter((b) => b.person === p)).toEqual([]);
    expect(r.absences).toEqual([]);
  });

  it('migration 0050: v1 allocations become bookings with the same weekly hours (holidays aside)', async () => {
    const [a] = await twoManagers();
    await mg.resetMgSample(a);
    const d = await mg.loadMg(a);
    await admin`DELETE FROM mg_bookings`;
    const p = d.people[1]!;
    const pj = d.projects[0]!;
    const ins = (id: string, from: string, to: string, hours: number, extra: object) =>
      admin`INSERT INTO mg_allocs (id, tenant_id, owner_id, person_id, project_id, from_date, to_date, hours, extra)
            VALUES (${id}, ${a.tenant.id}, ${a.user.id}, ${p.id}, ${pj.id}, ${from}, ${to}, ${hours}, ${JSON.stringify(extra)}::jsonb)`;
    const plain = crypto.randomUUID();
    const typed = crypto.randomUUID();
    const plan = crypto.randomUUID();
    // 32 h/week for 4 weeks, one week overridden to 16 h, one day typed
    await ins(plain, '2026-11-02', '2026-11-23', 32, {});
    await ins(typed, '2026-11-30', '2026-12-14', 20, {
      ovr: { '2026-12-07': 10 },
      dov: { '2026-12-16': 7 },
      fn: 'Líder FI',
    });
    // made in the v1 panel: 4 h a day Mon–Thu for 10 days from 5 Oct
    const dov: Record<string, number> = {};
    const days10 = [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-19',
      '2026-10-20',
    ];
    for (let n = dnOf('2026-10-05'); n <= dnOf('2026-10-23'); n++)
      if ((n + 3) % 7 < 5) dov[isoOf(n)] = days10.includes(isoOf(n)) ? 4 : 0;
    await ins(plan, '2026-10-05', '2026-10-19', 16, {
      start: '2026-10-05',
      hpd: 4,
      days: 10,
      mask: [1, 1, 1, 1, 0],
      dov,
    });
    // run the migration again (idempotent): converts the new v1 rows only
    const file = await fs.readFile('drizzle/0050_mg_alloc_v2.sql', 'utf8');
    for (const st of file.split('--> statement-breakpoint')) if (st.trim()) await admin.unsafe(st);
    const r = await al.loadAlloc(a, '2026-09-01', '2027-01-31');
    const by = Object.fromEntries(r.bookings.map((b) => [b.id, b]));
    expect(by[plain]).toMatchObject({
      mode: 'hpw',
      value: 32,
      from: '2026-11-02',
      to: '2026-11-27',
      mask: 31,
      days: {},
    });
    expect(by[typed]).toMatchObject({ mode: 'hpw', value: 20, role: 'Líder FI', to: '2026-12-18' });
    expect(by[plan]).toMatchObject({
      mode: 'hpd',
      value: 4,
      mask: 0b01111,
      from: '2026-10-05',
      to: '2026-10-20',
    });
    const env: CalcEnv = { weekly: () => 40, absences: () => [] };
    const week = (b: Booking, mon: string) => {
      const s = bookingSeries(b, env);
      let t = 0;
      for (let i = 0; i < 7; i++) t += s.h[dnOf(mon) + i - s.from] ?? 0;
      return t;
    };
    expect(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map((w) => week(by[plain]!, w))).toEqual([
      32, 32, 32, 32,
    ]);
    // 1 Dec and 8 Dec are holidays: their share is lost (20 → 16), the typed day is kept
    expect(['2026-11-30', '2026-12-07', '2026-12-14'].map((w) => week(by[typed]!, w))).toEqual([16, 8, 23]);
    // 5 Oct is a holiday (Implantação da República)
    expect(['2026-10-05', '2026-10-12', '2026-10-19'].map((w) => week(by[plan]!, w))).toEqual([12, 16, 8]);
    expect(r.bookings.filter((b) => [plain, typed, plan].includes(b.id))).toHaveLength(3);
    // still there for rollback
    expect(
      (await admin`SELECT count(*)::int n FROM mg_allocs WHERE id IN (${plain}, ${typed}, ${plan})`)[0]!.n,
    ).toBe(3);
  });
});
