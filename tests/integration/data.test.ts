import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { strFromU8, unzipSync } from 'fflate';

// Batch C "data": note history, saved views and "Exportar os meus dados",
// through the real services under RLS (kh_app), with MinIO for the files.
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
const doc = (text: string, ...srcs: string[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text }] },
    ...srcs.map((src) => ({ type: 'image', attrs: { src, alt: 'ecrã' } })),
  ],
});
type Auth = import('@/server/auth/session').AuthContext;

describe.skipIf(!enabled)('data: versions, views, export', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let ver: typeof import('@/server/content/noteVersions');
  let views: typeof import('@/server/content/views');
  let tasks: typeof import('@/server/content/tasks');
  let exp: typeof import('@/server/dataExport');
  let job: typeof import('@/server/jobs/export');
  let sh: typeof import('@/server/share/folders');
  let apip: typeof import('@/server/content/apiPlayground');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    // other branches share this test database: make sure this branch's migration is in
    await admin.unsafe(
      (await fs.readFile('drizzle/0042_versions_views_exports.sql', 'utf8')).replace(
        /--> statement-breakpoint/g,
        '',
      ),
    );
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, ver, views, tasks, exp, job, sh, apip, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/noteVersions'),
      import('@/server/content/views'),
      import('@/server/content/tasks'),
      import('@/server/dataExport'),
      import('@/server/jobs/export'),
      import('@/server/share/folders'),
      import('@/server/content/apiPlayground'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE data_exports, saved_views, note_versions, user_templates, ai_messages, ai_chats, ai_settings, public_links, share_members, share_people, shared_folders, api_envs, api_requests, task_subtasks, tasks, note_attachments, notes, folders, user_assets, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
    const c = await codesSvc.createCode({ type: 'license', planCode: 'ULTRA', maxUses: 1 });
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
  /** pretends the note's versions were taken more than 10 minutes ago */
  const age = (noteId: string) =>
    admin`update note_versions set created_at = created_at - interval '11 minutes' where note_id = ${noteId}`;
  async function sharedNotes(a: Auth, b: Auth, perm: 'read' | 'edit') {
    const sf = await sh.createSharedFolder(a, { kind: 'notes', name: 'Projeto Atlas' });
    await sh.addMember(a, sf, b.user.email, { lang: 'pt' });
    const inv = (await sh.listInvites(b)).find((i) => i.folderId === sf)!;
    await sh.answerInvite(b, inv.id, true);
    if (perm === 'edit') {
      const m = (await sh.listSharedFolders(a)).find((f) => f.id === sf)!.members[0]!;
      await sh.updateMember(a, m.id, { perm: 'edit' });
    }
    return sf;
  }

  // ── Note history ─────────────────────────────────────────────────────────
  it('versions: at most one per 10 minutes, server-side; restore keeps the current state first', async () => {
    const ana = await signedIn('ana@ver.pt');
    const n = await notes.createNote(ana, { title: 'Go-live' });
    await notes.updateNote(ana, n.id, { content: doc('v1') });
    // the state before the first edit (title only) is kept
    let vs = await ver.listNoteVersions(ana, n.id);
    expect(vs.map((v) => [v.title, v.chars, v.author])).toEqual([['Go-live', 0, 'ana']]);
    // within 10 minutes: nothing new, whatever the client does
    await notes.updateNote(ana, n.id, { content: doc('v2 mais texto') });
    await notes.updateNote(ana, n.id, { title: 'Go-live SF' });
    expect(await ver.listNoteVersions(ana, n.id)).toHaveLength(1);
    // favourite / tags don't count as edits
    await age(n.id);
    await notes.updateNote(ana, n.id, { favorite: true, tags: ['SAP'] });
    expect(await ver.listNoteVersions(ana, n.id)).toHaveLength(1);
    await notes.updateNote(ana, n.id, { content: doc('v3') });
    vs = await ver.listNoteVersions(ana, n.id);
    expect(vs.map((v) => [v.title, v.excerpt])).toEqual([
      ['Go-live SF', 'v2 mais texto'],
      ['Go-live', ''],
    ]);
    expect(vs[0]!.delta).toBe('v2 mais texto'.length);

    // preview, then restore the oldest: the current state (v3) becomes a version first
    const old = vs[1]!;
    expect((await ver.getNoteVersion(ana, n.id, old.id)).title).toBe('Go-live');
    const restored = await ver.restoreNoteVersion(ana, n.id, old.id);
    expect(restored.title).toBe('Go-live');
    expect(JSON.stringify(restored.content)).not.toContain('v3');
    vs = await ver.listNoteVersions(ana, n.id);
    expect(vs.map((v) => [v.reason, v.excerpt])).toEqual([
      ['restore', 'v3'],
      ['auto', 'v2 mais texto'],
      ['auto', ''],
    ]);
    expect((await notes.listNotes(ana, { search: 'v3' })).length).toBe(0);
  });

  it('versions: newest 50 and the first are kept; private, shared by permission, purged with the note', async () => {
    const ana = await signedIn('ana@ver2.pt');
    const bia = await signedIn('bia@ver2.pt');
    const rui = await signedIn('rui@ver2.pt');
    const n = await notes.createNote(ana, { title: 'Muitas versões' });
    for (let i = 0; i < 55; i++) {
      await notes.updateNote(ana, n.id, { content: doc(`texto ${i}`) });
      await age(n.id);
    }
    const vs = await ver.listNoteVersions(ana, n.id);
    expect(vs).toHaveLength(51);
    expect(vs.at(-1)!.excerpt).toBe(''); // the first one (title only) is still there
    expect(vs[0]!.excerpt).toBe('texto 53');
    expect(vs.at(-2)!.excerpt).toBe('texto 4');

    // another person: nothing
    expect(await codeOf(ver.listNoteVersions(rui, n.id))).toBe('not_found');
    expect(await codeOf(ver.getNoteVersion(rui, n.id, vs[0]!.id))).toBe('not_found');
    expect(await codeOf(ver.restoreNoteVersion(rui, n.id, vs[0]!.id))).toBe('not_found');

    // a read-only member sees the history but can't restore; an edit member can
    const sf = await sharedNotes(ana, bia, 'read');
    await notes.updateNote(ana, n.id, { sharedFolderId: sf });
    expect(await ver.listNoteVersions(bia, n.id)).toHaveLength(51);
    expect(await codeOf(ver.restoreNoteVersion(bia, n.id, vs[3]!.id))).toBe('not_found');
    const m = (await sh.listSharedFolders(ana)).find((f) => f.id === sf)!.members[0]!;
    await sh.updateMember(ana, m.id, { perm: 'edit' });
    expect((await ver.restoreNoteVersion(bia, n.id, vs[3]!.id)).content).toEqual(doc('texto 50'));
    const after = await ver.listNoteVersions(ana, n.id);
    expect(after[0]).toMatchObject({ reason: 'restore', author: 'bia', excerpt: 'texto 54' });
    expect(after).toHaveLength(51); // trimmed back (the first is kept)

    // the Trash: purging the note removes its history
    await notes.trashNote(ana, n.id);
    await notes.purgeTrash(ana, [{ kind: 'note', id: n.id }]);
    const [left] = await admin<{ c: number }[]>`select count(*)::int as c from note_versions`;
    expect(left!.c).toBe(0);
  });

  it('versions keep their images from the daily prune', async () => {
    const ana = await signedIn('ana@ver3.pt');
    const n = await notes.createNote(ana, { title: 'Ecrãs' });
    const img = await notes.addNoteImage(ana, n.id, PNG);
    await notes.updateNote(ana, n.id, { content: doc('com imagem', `/api/v1/files/${img}`) });
    await age(n.id);
    // the image leaves the note; the version taken now still shows it
    await notes.updateNote(ana, n.id, { content: doc('sem imagem') });
    expect((await ver.listNoteVersions(ana, n.id))[0]!.excerpt).toBe('com imagem');
    await admin`update note_attachments set created_at = now() - interval '2 days'`;
    const { pruneNoteImages } = await import('@/server/jobs/trash');
    expect(await pruneNoteImages()).toBe(0);
    expect(await notes.readFile(ana, img)).not.toBeNull();
    // once no version shows it either, it goes
    await admin`delete from note_versions`;
    expect(await pruneNoteImages()).toBe(1);
  });

  // ── Saved views ──────────────────────────────────────────────────────────
  it('saved views: CRUD under RLS, validated filters, live counts that match the lists', async () => {
    const ana = await signedIn('ana@views.pt');
    const rui = await signedIn('rui@views.pt');
    const mods = new Set(['notes', 'tasks']);
    const f = await notes.createFolder(ana, 'Atlas');
    for (const [title, tags] of [
      ['SAP 1', ['SAP']],
      ['SAP e FI', ['SAP', 'FI']],
      ['Só FI', ['FI']],
      ['Nada', []],
    ] as const) {
      const x = await notes.createNote(ana, { title, folderId: f.id });
      await notes.updateNote(ana, x.id, { tags: [...tags] });
    }
    const old = await notes.createNote(ana, { title: 'SAP antigo' });
    await notes.updateNote(ana, old.id, { tags: ['SAP'] });
    await admin`update notes set updated_at = now() - interval '40 days' where id = ${old.id}`;

    const v1 = await views.createView(ana, {
      kind: 'notes',
      name: 'SAP · 30 dias',
      filter: views.noteViewFilter.parse({ tags: ['SAP'], days: 30 }),
    });
    expect(v1.count).toBe(2);
    const v2 = await views.createView(ana, {
      kind: 'notes',
      name: 'SAP e FI no Atlas',
      filter: views.noteViewFilter.parse({ folder: f.id, tags: ['SAP', 'FI'], tagMode: 'all' }),
    });
    expect(v2.count).toBe(1);
    // the list does the same server-side (and pages with the filter)
    expect((await notes.listNotes(ana, { tags: ['SAP'], days: 30 })).map((x) => x.title).sort()).toEqual([
      'SAP 1',
      'SAP e FI',
    ]);
    expect((await notes.listNotes(ana, { tags: ['SAP', 'FI'], tagMode: 'any' })).length).toBe(4);
    const p1 = await notes.listNotes(ana, { tags: ['SAP', 'FI'], limit: 2 });
    const p2 = await notes.listNotes(ana, {
      tags: ['SAP', 'FI'],
      limit: 2,
      after: `${p1[1]!.updatedAt}|${p1[1]!.id}`,
    });
    expect(new Set([...p1, ...p2].map((x) => x.id)).size).toBe(4);
    expect(views.noteViewParams(new URLSearchParams('tag=SAP&tag=FI&tag=SAP&tm=all&days=30&x=1'))).toEqual({
      tags: ['SAP', 'FI'],
      tagMode: 'all',
      days: 30,
    });

    // tasks
    const t1 = await tasks.createTask(ana, { title: 'Atlas urgente' });
    await tasks.updateTask(ana, t1.id, { priority: 'high', dueOn: new Date().toISOString().slice(0, 10) });
    const t2 = await tasks.createTask(ana, { title: 'Atlas normal' });
    await tasks.updateTask(ana, t2.id, { priority: 'low' });
    const tv = await views.createView(ana, {
      kind: 'tasks',
      name: 'Alta prioridade',
      filter: views.taskViewFilter.parse({ priority: ['high'], due: 'week', q: 'atlas' }),
    });
    expect(tv.count).toBe(1);

    // bad filters are refused
    expect(() => views.noteViewFilter.parse({ folder: '../x' })).toThrow();
    expect(() => views.taskViewFilter.parse({ due: 'yesterday' })).toThrow();
    expect(() => views.noteViewFilter.parse({ evil: 1 })).toThrow();

    // rename, reorder, filter update, delete
    await views.updateView(ana, v1.id, { name: 'SAP recente', filter: { tags: ['SAP'], days: 60 } });
    await expect(views.updateView(ana, v1.id, { filter: { status: 'done' } })).rejects.toThrow();
    await views.reorderViews(ana, [tv.id, v2.id, v1.id]);
    let list = await views.listViews(ana, mods);
    expect(list.map((v) => [v.name, v.count])).toEqual([
      ['Alta prioridade', 1],
      ['SAP e FI no Atlas', 1],
      ['SAP recente', 3],
    ]);
    // views of a module outside the plan are not listed
    expect((await views.listViews(ana, new Set(['notes']))).map((v) => v.kind)).toEqual(['notes', 'notes']);

    // RLS: Rui sees none and can't touch them
    expect(await views.listViews(rui, mods)).toEqual([]);
    expect(await codeOf(views.updateView(rui, v1.id, { name: 'x' }))).toBe('not_found');
    expect(await codeOf(views.deleteView(rui, v1.id))).toBe('not_found');
    await views.reorderViews(rui, [v1.id]);
    // his own view over Ana's notebook id counts nothing of hers
    const rv = await views.createView(rui, {
      kind: 'notes',
      name: 'Espião',
      filter: views.noteViewFilter.parse({ folder: f.id }),
    });
    expect(rv.count).toBe(0);

    await views.deleteView(ana, v2.id);
    list = await views.listViews(ana, mods);
    expect(list.map((v) => v.name)).toEqual(['Alta prioridade', 'SAP recente']);
  });

  // ── Export ───────────────────────────────────────────────────────────────
  async function zipOf(a: Auth, id: string) {
    const f = await exp.openExport(a, id);
    const buf = new Uint8Array(await new Response(f.stream).arrayBuffer());
    return unzipSync(buf);
  }

  it('export: a ZIP of what the person owns, no secrets, nobody else data', async () => {
    const ana = await signedIn('ana@exp.pt');
    const bia = await signedIn('bia@exp.pt');
    // Ana's notes (one with an image), a task with subtasks, an API request with secrets
    const nb = await notes.createFolder(ana, 'Projeto: Atlas/2026');
    const n = await notes.createNote(ana, { title: 'Go-live SF', folderId: nb.id });
    const img = await notes.addNoteImage(ana, n.id, PNG);
    await notes.updateNote(ana, n.id, {
      tags: ['SAP', 'Go-live'],
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Passos' }] },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SM37' }] }],
              },
            ],
          },
          { type: 'image', attrs: { src: `/api/v1/files/${img}` } },
        ],
      },
    });
    const t = await tasks.createTask(ana, { title: 'Testar, "aspas"' });
    await tasks.addSubtask(ana, t.id, 'sub 1');
    const r = await apip.createApiRequest(ana, { title: 'Token' });
    await apip.updateApiRequest(ana, r.id, {
      url: 'https://api.example.com/x?api_key=abc',
      headers: [
        { k: 'Authorization', v: 'Bearer SUPER-SECRET-1', on: true },
        { k: 'Accept', v: 'application/json', on: true },
      ],
      params: [{ k: 'token', v: 'SUPER-SECRET-2', on: true }],
      authType: 'bearer',
      auth: { token: 'SUPER-SECRET-3', user: '', pass: '' },
    });
    const env = await apip.createApiEnv(ana, { name: 'PRD', folderId: null });
    await apip.updateApiEnv(ana, env.id, { vars: [{ k: 'host', v: 'SUPER-SECRET-4', on: true }] });
    // a note in the trash is not exported
    const gone = await notes.createNote(ana, { title: 'No lixo' });
    await notes.trashNote(ana, gone.id);
    // Bia (edit member of Ana's shared folder) puts her own note there; and has private ones
    const sf = await sharedNotes(ana, bia, 'edit');
    await notes.createNote(bia, { title: 'Da Bia na pasta da Ana', sharedFolderId: sf });
    await notes.createNote(bia, { title: 'Privada da Bia' });

    const e = await exp.requestExport(ana, { enqueue: false });
    expect(e.status).toBe('pending');
    // one at a time
    expect(await codeOf(exp.requestExport(ana, { enqueue: false }))).toBe('export_in_progress');
    // not downloadable until ready, and never by someone else
    expect(await codeOf(exp.openExport(ana, e.id))).toBe('not_found');
    const out = await job.runExport({ exportId: e.id, tenantId: ana.tenant.id, userId: ana.user.id });
    expect(out).toMatchObject({ ready: true });
    expect(await codeOf(exp.openExport(bia, e.id))).toBe('not_found');
    const st = await exp.listExports(ana);
    expect(st.exports[0]).toMatchObject({ id: e.id, status: 'ready' });
    expect(st.left).toBe(2);
    expect((await exp.listExports(bia)).exports).toEqual([]);
    // the email with a link into the app (login required)
    const mails = (await fs.readdir(outbox)).filter((f) => f.includes('-exportReady-'));
    expect(mails).toHaveLength(1);
    expect(await fs.readFile(path.join(outbox, mails[0]!), 'utf8')).toContain('/app?account=export');

    const z = await zipOf(ana, e.id);
    const names = Object.keys(z);
    const all = names.map((k) => strFromU8(z[k]!)).join('\n');
    expect(names).toContain('README.txt');
    expect(names).toContain('account.json');
    const md = names.find((k) => k.startsWith('notes/Projeto Atlas 2026/') && k.endsWith('Go-live SF.md'))!;
    expect(md).toBeTruthy();
    const note = strFromU8(z[md]!);
    expect(note).toContain('tags: ["SAP","Go-live"]');
    expect(note).toContain('## Passos');
    expect(note).toContain('- [x] SM37');
    expect(note).toContain(`](../assets/${img}.png)`);
    expect(z[`notes/assets/${img}.png`]).toEqual(PNG);
    expect(strFromU8(z['tasks/tasks.csv']!)).toContain('"Testar, ""aspas"""');
    expect(JSON.parse(strFromU8(z['tasks/tasks.json']!))[0].subtasks).toEqual([
      { title: 'sub 1', done: false },
    ]);
    const api = JSON.parse(strFromU8(z['api/collections.json']!));
    expect(api.requests[0].auth).toEqual({ type: 'bearer', credentials: '[REDACTED]' });
    expect(api.requests[0].headers[0].v).toBe('[REDACTED]');
    expect(api.requests[0].headers[1].v).toBe('application/json');
    expect(api.environments[0]).toMatchObject({ name: 'PRD', variables: '[REDACTED]' });
    expect(all).not.toMatch(/SUPER-SECRET|vars_ct|auth_ct|authCt|varsCt/);
    expect(
      JSON.parse(strFromU8(z['tags.json']!))
        .map((x: { name: string }) => x.name)
        .sort(),
    ).toEqual(['Go-live', 'SAP']);
    // nobody else's data, not the Trash, not the vault
    expect(all).not.toContain('Bia');
    expect(all).not.toContain('No lixo');
    expect(names.some((k) => /vault|password/i.test(k))).toBe(false);
    expect(strFromU8(z['README.txt']!)).toContain('cofre');

    // Bia's export has her notes, not Ana's (also not Ana's note in the folder they share)
    const eb = await exp.requestExport(bia, { enqueue: false });
    await job.runExport({ exportId: eb.id, tenantId: bia.tenant.id, userId: bia.user.id });
    const zb = Object.keys(await zipOf(bia, eb.id));
    expect(zb.filter((k) => k.startsWith('notes/')).sort()).toEqual([
      'notes/Sem caderno/Da Bia na pasta da Ana.md',
      'notes/Sem caderno/Privada da Bia.md',
    ]);

    // 3 a day
    await job.runExport({
      ...{ tenantId: ana.tenant.id, userId: ana.user.id },
      exportId: (await exp.requestExport(ana, { enqueue: false })).id,
    });
    await job.runExport({
      ...{ tenantId: ana.tenant.id, userId: ana.user.id },
      exportId: (await exp.requestExport(ana, { enqueue: false })).id,
    });
    expect(await codeOf(exp.requestExport(ana, { enqueue: false }))).toBe('rate_limited');

    // 7 days later: expired, the file removed by the daily job
    await admin`update data_exports set expires_at = now() - interval '1 minute' where id = ${e.id}`;
    expect((await exp.listExports(ana)).exports.find((x) => x.id === e.id)!.status).toBe('expired');
    expect(await codeOf(exp.openExport(ana, e.id))).toBe('not_found');
    const r2 = await job.expireExports();
    expect(r2.expired).toBe(1);
    const [row] = await admin<{ status: string; storage_key: string | null }[]>`
      select status, storage_key from data_exports where id = ${e.id}`;
    expect(row).toEqual({ status: 'expired', storage_key: null });
  });

  it('export: Markdown, CSV and SVG helpers', async () => {
    const { docToMarkdown } = await import('@/lib/docMarkdown');
    expect(
      docToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'a ' },
              { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'SE38', marks: [{ type: 'code' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://x.pt' } }] },
            ],
          },
          {
            type: 'orderedList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'um' }] }] },
            ],
          },
          { type: 'codeBlock', attrs: { language: 'abap' }, content: [{ type: 'text', text: 'WRITE x.' }] },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A|B' }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(
      'a **b** `SE38` [site](https://x.pt)\n\n1. um\n\n```abap\nWRITE x.\n```\n\n| A\\|B |\n| --- |\n| 1 |\n',
    );
    expect(job.toCsv(['a', 'b'], [['=1+1', 'x;y']])).toBe('﻿a,b\r\n"\'=1+1","x;y"\r\n');
    expect(
      job.redactKv([
        { k: 'X-Api-Key', v: 'k', on: true },
        { k: 'Accept', v: 'json', on: true },
      ]),
    ).toEqual([
      { k: 'X-Api-Key', v: '[REDACTED]', on: true },
      { k: 'Accept', v: 'json', on: true },
    ]);
    expect(job.safeName(' ../a:b*c? ')).toBe('a b c');
    const { whiteboardSvg } = await import('@/lib/whiteboardSvg');
    const svg = whiteboardSvg(
      [
        {
          id: 'a',
          t: 'rect',
          x: 0,
          y: 0,
          w: 100,
          h: 50,
          stroke: '#ffffff',
          fill: 'none',
          sw: 2,
          dash: 'solid',
          fs: 16,
          text: 'Olá <b>',
        },
        { id: 'i', t: 'image', x: 0, y: 60, w: 10, h: 10, file: '00000000-0000-0000-0000-000000000001' },
      ],
      (f) => `assets/${f}.png`,
    );
    expect(svg).toContain('<rect x="0" y="0" width="100" height="50"');
    expect(svg).toContain('Olá &#60;b&#62;');
    expect(svg).toContain('href="assets/00000000-0000-0000-0000-000000000001.png"');
  });
});
