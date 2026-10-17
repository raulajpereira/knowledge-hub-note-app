import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AuthContext } from '@/server/auth/session';

// SAP batch C through the real services, as kh_app under RLS: Notas SAP
// (tenant-shared, one number per tenant, status per system, Trash), test
// evidence (RLS, cleanup with the record) and cutover dependencies.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

describe.skipIf(!enabled)('sap batch C', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let sap: typeof import('@/server/content/sap');
  let ot: typeof import('@/server/content/transports');
  let sn: typeof import('@/server/content/sapNotes');
  let fn: typeof import('@/server/content/functional');
  let ev: typeof import('@/server/content/fnEvidence');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, sap, ot, sn, fn, ev, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/sap'),
      import('@/server/content/transports'),
      import('@/server/content/sapNotes'),
      import('@/server/content/functional'),
      import('@/server/content/fnEvidence'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE sap_fn_evidence, sap_note_systems, sap_note_transports, sap_notes, sap_fn_records, sap_transports, sap_systems, mg_clients, item_links, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
    const c = await codesSvc.createCode({ type: 'license', planCode: 'SAP', maxUses: 1 });
    await svc.register({ name: 'Ana Teste', email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  /** Another member of the same tenant (as the Trash job builds it). */
  async function teammate(of: AuthContext, email: string): Promise<AuthContext> {
    const [u] =
      await admin`insert into users (tenant_id, name, email) values (${of.tenant.id}, 'Rui', ${email}) returning id`;
    return { ...of, user: { ...of.user, id: u!.id as string, email } };
  }
  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );

  it('the module comes with the SAP and ULTRA packages', async () => {
    const rows =
      await admin`select p.code from plan_modules pm join plans p on p.id = pm.plan_id where pm.module_id = 'sapnotes' order by 1`;
    expect(rows.map((r) => r.code)).toEqual(['SAP', 'ULTRA']);
  });

  it('SAP notes: shared by the tenant, unique number, status per system, transports, links, Trash', async () => {
    const a = await signedIn('sn-a@example.pt');
    const rui = await teammate(a, 'sn-rui@example.pt');
    const other = await signedIn('sn-b@example.pt');
    const dev = await sap.createSystem(a, { name: 'ECC DEV', sid: 'ECD', env: 'DEV' });
    const prd = await sap.createSystem(a, { name: 'ECC PRD', sid: 'ECP', env: 'PRD' });
    const tr = await ot.createTransport(a, { systemId: dev.id, trkorr: 'ECDK900123' });

    const n = await sn.createSapNote(a, {
      number: 3089413,
      title: 'Correção do IVA',
      component: 'FI-LOC',
      category: 'legal',
      priority: 'high',
      impl: ['snote', 'manual'],
      prereqs: [2998510, 3089413],
      validity: [{ swc: 'S4CORE', rel: '106', sp: 'SP0000-SP0002' }],
      tags: ['IVA', 'IVA'],
      transportIds: [tr.id],
    });
    expect(n).toMatchObject({ number: 3089413, prereqs: [2998510], tags: ['IVA'], transportIds: [tr.id] });
    // a teammate sees and edits the same note; another tenant sees nothing
    expect((await sn.listSapNotes(rui)).map((x) => x.number)).toEqual([3089413]);
    await sn.updateSapNote(rui, n.id, {
      version: 3,
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect((await sn.getSapNote(a, n.id)).version).toBe(3);
    expect(await sn.listSapNotes(other)).toEqual([]);
    expect(await codeOf(sn.getSapNote(other, n.id))).toBe('not_found');
    expect(await codeOf(sn.updateSapNote(other, n.id, { title: 'x' }))).toBe('not_found');
    expect(await codeOf(sn.setNoteSystem(other, n.id, dev.id, { status: 'done' }))).toBe('not_found');
    // the other tenant can have the same number
    await sn.createSapNote(other, { number: 3089413 });
    // …but not twice in one tenant (also through import or renumbering)
    expect(await codeOf(sn.createSapNote(rui, { number: 3089413 }))).toBe('note_exists');
    const imp = await sn.importSapNotes(a, [3089413, 2998510, 3131059, 2998510]);
    expect([imp.created.map((x) => x.number).sort(), imp.skipped]).toEqual([[2998510, 3131059], [3089413]]);
    const n2 = imp.created.find((x) => x.number === 2998510)!;
    expect(await codeOf(sn.updateSapNote(a, n2.id, { number: 3089413 }))).toBe('note_exists');
    // images are not accepted in the notes; foreign transports and projects are refused
    expect(
      await codeOf(
        sn.updateSapNote(a, n.id, {
          body: {
            type: 'doc',
            content: [
              { type: 'image', attrs: { src: '/api/v1/files/0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' } },
            ],
          },
        }),
      ),
    ).toBe('doc_invalid');
    const trB = await ot.createTransport(other, { trkorr: 'XXXK900001' });
    expect(await codeOf(sn.updateSapNote(a, n.id, { transportIds: [trB.id] }))).toBe('transport_not_found');

    // status per system: "Implementada" gets today's date, keeps the transport used
    const st = await sn.setNoteSystem(rui, n.id, dev.id, { status: 'done', transportId: tr.id });
    expect(st).toMatchObject({ status: 'done', transportId: tr.id });
    expect(st.implOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await sn.setNoteSystem(a, n.id, prd.id, { status: 'todo' });
    expect(
      await codeOf(sn.setNoteSystem(a, n.id, '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', { status: 'done' })),
    ).toBe('system_not_found');
    const got = (await sn.listSapNotes(a)).find((x) => x.id === n.id)!;
    expect(got.systems[dev.id]).toMatchObject({ status: 'done', transportId: tr.id });
    expect(got.systems[prd.id]?.status).toBe('todo');
    // the status table is tenant-only: the other tenant's list never carries it
    expect(Object.keys((await sn.listSapNotes(other))[0]!.systems)).toEqual([]);

    // links ("Ligações") and the Trash
    const note = await notes.createNote(a, { title: 'Análise IVA' });
    await notes.linkItems(a, { type: 'sapnote', id: n.id }, { type: 'note', id: note.id });
    expect((await notes.linksOf(a, { type: 'note', id: note.id })).map((l) => [l.type, l.title])).toEqual([
      ['sapnote', '3089413 · Correção do IVA'],
    ]);
    await sn.trashSapNote(a, n.id);
    expect(await codeOf(sn.createSapNote(a, { number: 3089413 }))).toBe('note_in_trash');
    expect((await notes.listTrash(rui)).map((x) => [x.kind, x.title])).toContainEqual([
      'sapnote',
      '3089413 · Correção do IVA',
    ]);
    await notes.restoreTrash(a, [{ kind: 'sapnote', id: n.id }]);
    expect((await sn.listSapNotes(a)).some((x) => x.id === n.id)).toBe(true);
    await sn.trashSapNote(a, n.id);
    await notes.purgeTrash(a, 'all');
    expect((await sn.listSapNotes(a)).some((x) => x.id === n.id)).toBe(false);
    expect(await admin`select 1 from sap_note_systems where note_id = ${n.id}`).toHaveLength(0);
    expect(await admin`select 1 from item_links where a_id = ${n.id} or b_id = ${n.id}`).toHaveLength(0);
  });

  it('systems: track and transport target inside the tenant', async () => {
    const a = await signedIn('ls-a@example.pt');
    const b = await signedIn('ls-b@example.pt');
    const d = await sap.createSystem(a, { name: 'BW DEV', sid: 'BWD', env: 'DEV', track: 'BW' });
    const p = await sap.createSystem(a, { name: 'BW PRD', sid: 'BWP', env: 'PRD', track: 'BW' });
    const sbx = await sap.createSystem(a, { name: 'Sandbox', sid: 'SBX', env: 'SBX' });
    expect(sbx.env).toBe('SBX');
    expect((await sap.updateSystem(a, d.id, { nextId: p.id })).nextId).toBe(p.id);
    expect(await codeOf(sap.updateSystem(a, d.id, { nextId: d.id }))).toBe('invalid_input');
    const x = await sap.createSystem(b, { name: 'other', sid: 'OTH', env: 'DEV' });
    expect(await codeOf(sap.updateSystem(a, d.id, { nextId: x.id }))).toBe('system_not_found');
  });

  it('test evidence: per step, shared by the tenant, limits, removed with the record', async () => {
    const a = await signedIn('ev-a@example.pt');
    const rui = await teammate(a, 'ev-rui@example.pt');
    const other = await signedIn('ev-b@example.pt');
    const rec = await fn.createRecord(a, 'fn_test', {
      title: 'Venda nacional',
      rows: [{ step: 'Criar encomenda', expected: 'OK' }, { step: 'Faturar' }],
    });
    // the service gave every step an id
    const [s1, s2] = rec.rows.map((r) => r.id!);
    expect(s1 && s2 && s1 !== s2).toBeTruthy();
    const e1 = await ev.addEvidence(a, rec.id, s1!, 'C:\\shots\\va01.png', PNG);
    expect(e1).toMatchObject({ rowId: s1, name: 'va01.png', mime: 'image/png', size: PNG.length });
    const e2 = await ev.addEvidence(rui, rec.id, s2!, 'log.txt', new TextEncoder().encode('ok'));
    expect(e2.mime).toBe('text/plain');
    expect(await codeOf(ev.addEvidence(a, rec.id, s1!, 'x.exe', new Uint8Array([77, 90, 1, 2])))).toBe(
      'unsupported_file',
    );
    expect(await codeOf(ev.addEvidence(a, rec.id, 'nope1234', 'a.png', PNG))).toBe('row_not_found');
    expect(await codeOf(ev.addEvidence(other, rec.id, s1!, 'a.png', PNG))).toBe('not_found');
    // a cutover record takes no evidence
    const cut = await fn.createRecord(a, 'fn_cut', { title: 'Go-live', rows: [{ act: 'x' }] });
    expect(await codeOf(ev.addEvidence(a, cut.id, cut.rows[0]!.id!, 'a.png', PNG))).toBe('not_found');

    const list = await ev.listEvidence(rui, [rec.id]);
    expect(list[rec.id]!.map((x) => x.rowId)).toEqual([s1, s2]);
    expect(await ev.listEvidence(other, [rec.id])).toEqual({});
    expect((await ev.readEvidence(rui, e1.id))?.mime).toBe('image/png');
    expect(await ev.readEvidence(other, e1.id)).toBeNull();
    expect(await codeOf(ev.deleteEvidence(other, e1.id))).toBe('not_found');

    // limit per step
    const { EVIDENCE_LIMITS } = ev;
    await admin`insert into sap_fn_evidence (tenant_id, record_id, row_id, storage_key, mime, size)
      select ${a.tenant.id}, ${rec.id}, ${s2!}, 'k' || g, 'text/plain', 1 from generate_series(2, ${EVIDENCE_LIMITS.perStep}) g`;
    expect(await codeOf(ev.addEvidence(a, rec.id, s2!, 'b.txt', new TextEncoder().encode('x')))).toBe(
      'limit_reached',
    );
    await admin`delete from sap_fn_evidence where storage_key ~ '^k[0-9]+$'`;

    // a step removed: its evidence is pruned a day later; the record purged: everything goes
    await fn.updateRecord(a, 'fn_test', rec.id, { rows: [rec.rows[0]!] });
    await admin`update sap_fn_evidence set created_at = now() - interval '2 days'`;
    const [{ n }] = (await admin`select kh_prune_fn_evidence() as n`) as unknown as [{ n: number }];
    expect(n).toBe(1);
    expect((await ev.listEvidence(a, [rec.id]))[rec.id]!.map((x) => x.id)).toEqual([e1.id]);
    const keys = await admin`select k from kh_storage_keys() k`;
    expect(keys.some((r) => String(r.k).includes(`/fn-evidence/${rec.id}/`))).toBe(true);
    await fn.trashRecord(a, 'fn_test', rec.id);
    expect(await ev.readEvidence(a, e1.id)).toBeNull(); // not while in the Trash
    await notes.purgeTrash(a, 'all');
    expect(await admin`select 1 from sap_fn_evidence where record_id = ${rec.id}`).toHaveLength(0);
  });

  it('cutover: predecessors in the same runbook, no cycles (checked by the server)', async () => {
    const a = await signedIn('cu-a@example.pt');
    const r = await fn.createRecord(a, 'fn_cut', {
      title: 'Go-live',
      rows: [
        { id: 'aaaa', act: 'Fecho do legado', dur: '60' },
        { id: 'bbbb', act: 'Carga de saldos', dur: '120', dep: 'aaaa' },
      ],
    });
    expect(r.rows[1]).toMatchObject({ dep: 'aaaa' });
    const cyc = [
      { id: 'aaaa', act: 'a', dep: 'bbbb' },
      { id: 'bbbb', act: 'b', dep: 'aaaa' },
    ];
    expect(await codeOf(fn.updateRecord(a, 'fn_cut', r.id, { rows: cyc }))).toBe('cutover_cycle');
    expect(await codeOf(fn.updateRecord(a, 'fn_cut', r.id, { rows: [{ id: 'aaaa', dep: 'aaaa' }] }))).toBe(
      'cutover_dep_self',
    );
    expect(await codeOf(fn.updateRecord(a, 'fn_cut', r.id, { rows: [{ id: 'aaaa', dep: 'zzzz' }] }))).toBe(
      'cutover_dep_missing',
    );
    // another runbook's row id is not a predecessor here
    const r2 = await fn.createRecord(a, 'fn_cut', { title: 'Outro', rows: [{ id: 'cccc', act: 'c' }] });
    expect(
      await codeOf(fn.updateRecord(a, 'fn_cut', r.id, { rows: [{ id: 'aaaa', dep: r2.rows[0]!.id! }] })),
    ).toBe('cutover_dep_missing');
    // rows without ids (saved before) get one
    const up = await fn.updateRecord(a, 'fn_cut', r.id, { rows: [{ act: 'sem id' }] });
    expect(up.rows[0]!.id).toMatch(/^[a-z0-9]{8}$/);
  });
});
