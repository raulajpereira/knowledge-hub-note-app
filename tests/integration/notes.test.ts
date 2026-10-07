import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Phase 4.1: notes, notebooks, Trash, images and links through the real
// services. Every query runs as kh_app under RLS, so another user's rows are
// simply invisible (404), never readable.
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
const docWith = (...srcs: string[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Agendar o job Z_HR_SF na SM37' }] },
    ...srcs.map((src) => ({ type: 'image', attrs: { src } })),
  ],
});

describe.skipIf(!enabled)('notes', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let tasksSvc: typeof import('@/server/content/tasks');
  let voiceSvc: typeof import('@/server/content/voice');
  let homeSvc: typeof import('@/server/content/home');
  let vault: typeof import('@/server/content/vault');
  let mail: typeof import('@/server/content/emails');
  let iss: typeof import('@/server/content/issues');
  let art: typeof import('@/server/content/artifacts');
  let snip: typeof import('@/server/content/snippets');
  let apip: typeof import('@/server/content/apiPlayground');
  let wb: typeof import('@/server/content/whiteboards');
  let sapSvc: typeof import('@/server/content/sap');
  let otSvc: typeof import('@/server/content/transports');
  let cl: typeof import('@/server/content/codelib');
  let fn: typeof import('@/server/content/functional');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [
      svc,
      codesSvc,
      session,
      seed,
      notes,
      tasksSvc,
      voiceSvc,
      homeSvc,
      dbm,
      vault,
      mail,
      iss,
      art,
      snip,
      apip,
      wb,
      sapSvc,
      otSvc,
      cl,
      fn,
    ] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/tasks'),
      import('@/server/content/voice'),
      import('@/server/content/home'),
      import('@/db/client'),
      import('@/server/content/vault'),
      import('@/server/content/emails'),
      import('@/server/content/issues'),
      import('@/server/content/artifacts'),
      import('@/server/content/snippets'),
      import('@/server/content/apiPlayground'),
      import('@/server/content/whiteboards'),
      import('@/server/content/sap'),
      import('@/server/content/transports'),
      import('@/server/content/codelib'),
      import('@/server/content/functional'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE mg_requests, mg_timesheets, mg_allocs, mg_projects, mg_people, mg_teams, mg_settings, news_saved, sap_fn_records, sap_objects, sap_transports, sap_tcode_usage, sap_tcodes, sap_system_favs, sap_systems, mg_clients, whiteboard_images, whiteboards, api_envs, api_requests, snippets, artifact_versions, artifacts, issues, email_attachments, emails, vault_items, vault_keys, item_links, voice_notes, task_subtasks, tasks, note_attachments, notes, folders, user_assets, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  it('folders and notes are private to their owner (RLS)', async () => {
    const ana = await signedIn('ana@notes.pt');
    const rui = await signedIn('rui@notes.pt');
    const f = await notes.createFolder(ana, 'Ferramentas & debug');
    const n = await notes.createNote(ana, { folderId: f.id, title: 'Go-live SF' });
    await notes.updateNote(ana, n.id, { content: docWith(), tags: ['Go-live', ' Go-live ', 'SF'] });

    const mine = await notes.listFolders(ana);
    expect(mine.folders.map((x) => [x.name, x.count])).toEqual([['Ferramentas & debug', 1]]);
    expect(mine.total).toBe(1);
    const found = await notes.listNotes(ana, { search: 'z_hr_sf' });
    expect(found.map((x) => [x.title, x.tags, x.summary])).toEqual([
      ['Go-live SF', ['Go-live', 'SF'], 'Agendar o job Z_HR_SF na SM37'],
    ]);

    // Rui sees nothing and can't touch Ana's rows.
    expect((await notes.listFolders(rui)).folders).toEqual([]);
    expect(await notes.listNotes(rui, {})).toEqual([]);
    expect(await codeOf(notes.getNote(rui, n.id))).toBe('not_found');
    expect(await codeOf(notes.updateNote(rui, n.id, { title: 'x' }))).toBe('not_found');
    expect(await codeOf(notes.trashNote(rui, n.id))).toBe('not_found');
    expect(await codeOf(notes.renameFolder(rui, f.id, 'x'))).toBe('not_found');
    // …nor file his note into her notebook (trigger: folder must be the owner's).
    const r = await notes.createNote(rui, {});
    expect(await codeOf(notes.updateNote(rui, r.id, { folderId: f.id }))).toBe('folder_not_found');
    expect(await codeOf(notes.createNote(rui, { folderId: f.id }))).toBe('folder_not_found');
    expect((await notes.getNote(ana, n.id)).title).toBe('Go-live SF');

    // Favourites: toggling doesn't bump "Atualizada".
    const before = (await notes.getNote(ana, n.id)).updatedAt;
    await notes.updateNote(ana, n.id, { favorite: true });
    expect((await notes.getNote(ana, n.id)).updatedAt).toBe(before);
    expect((await notes.listFolders(ana)).favorites).toBe(1);
    expect((await notes.listNotes(ana, { fav: true })).map((x) => x.id)).toEqual([n.id]);
  });

  it('images belong to the note: owner-only, removed with the image, copied on duplicate', async () => {
    const ana = await signedIn('ana@img.pt');
    const rui = await signedIn('rui@img.pt');
    const n = await notes.createNote(ana, { title: 'Ecrãs' });
    expect(await codeOf(notes.addNoteImage(rui, n.id, PNG))).toBe('not_found');
    expect(await codeOf(notes.addNoteImage(ana, n.id, new TextEncoder().encode('<svg onload=x>')))).toBe(
      'unsupported_image',
    );
    const id1 = await notes.addNoteImage(ana, n.id, PNG);
    const id2 = await notes.addNoteImage(ana, n.id, PNG);
    await notes.updateNote(ana, n.id, { content: docWith(`/api/v1/files/${id1}`, `/api/v1/files/${id2}`) });
    expect((await notes.readFile(ana, id1))?.mime).toBe('image/png');
    expect(await notes.readFile(rui, id1)).toBeNull();

    const copy = await notes.duplicateNote(ana, n.id, ' (cópia)');
    expect(copy.title).toBe('Ecrãs (cópia)');
    const copied = JSON.stringify((await notes.getNote(ana, copy.id)).content);
    expect(copied).not.toContain(id1);
    const copyIds = [...copied.matchAll(/files\/([0-9a-f-]{36})/g)].map((m) => m[1]!);
    expect(copyIds).toHaveLength(2);
    expect((await notes.readFile(ana, copyIds[0]!))?.mime).toBe('image/png');

    // Removing an image from the document deletes its file (only that one).
    await notes.updateNote(ana, n.id, { content: docWith(`/api/v1/files/${id2}`) });
    expect(await notes.readFile(ana, id1)).toBeNull();
    expect(await notes.readFile(ana, id2)).not.toBeNull();
    expect(await notes.readFile(ana, copyIds[0]!)).not.toBeNull();
  });

  it('Trash: notebook with its notes, restore, purge', async () => {
    const ana = await signedIn('ana@trash.pt');
    const f = await notes.createFolder(ana, 'Performance');
    const a = await notes.createNote(ana, { folderId: f.id, title: 'FOR ALL ENTRIES' });
    const b = await notes.createNote(ana, { folderId: f.id, title: 'Índices' });
    const loose = await notes.createNote(ana, { title: 'Solta' });

    await notes.trashNote(ana, a.id);
    await notes.trashFolder(ana, f.id);
    expect((await notes.listNotes(ana, {})).map((x) => x.id)).toEqual([loose.id]);
    const trash = await notes.listTrash(ana);
    expect(trash.map((x) => [x.kind, x.title, x.daysLeft]).sort()).toEqual(
      [
        ['folder', 'Performance', 30],
        ['note', 'FOR ALL ENTRIES', 30],
        ['note', 'Índices', 30],
      ].sort(),
    );

    // A note restored while its notebook is still in the Trash comes back loose.
    await notes.restoreTrash(ana, [{ kind: 'note', id: b.id }]);
    expect((await notes.getNote(ana, b.id)).folderId).toBeNull();
    // Restoring the notebook brings back the notes deleted with it.
    await notes.restoreTrash(ana, [{ kind: 'folder', id: f.id }]);
    expect((await notes.getNote(ana, a.id)).folderId).toBe(f.id);

    await notes.trashNote(ana, loose.id);
    await notes.purgeTrash(ana, 'all');
    expect(await notes.listTrash(ana)).toEqual([]);
    expect(await codeOf(notes.getNote(ana, loose.id))).toBe('not_found');
    const [{ n }] = (await admin`select count(*)::int as n from notes where id = ${loose.id}`) as unknown as [
      { n: number },
    ];
    expect(n).toBe(0);
  });

  it('links between notes ("Ligações")', async () => {
    const ana = await signedIn('ana@links.pt');
    const rui = await signedIn('rui@links.pt');
    const a = await notes.createNote(ana, { title: 'Go-live SF' });
    const b = await notes.createNote(ana, { title: 'Debug de jobs' });
    const r = await notes.createNote(rui, { title: 'Do Rui' });

    await notes.linkItems(ana, { type: 'note', id: a.id }, { type: 'note', id: b.id });
    await notes.linkItems(ana, { type: 'note', id: b.id }, { type: 'note', id: a.id }); // same pair: no-op
    expect(await notes.linksOf(ana, { type: 'note', id: b.id })).toEqual([
      { type: 'note', id: a.id, title: 'Go-live SF' },
    ]);
    expect(await codeOf(notes.linkItems(ana, { type: 'note', id: a.id }, { type: 'note', id: r.id }))).toBe(
      'not_found',
    );
    expect(await codeOf(notes.linkItems(ana, { type: 'note', id: a.id }, { type: 'note', id: a.id }))).toBe(
      'invalid_input',
    );
    expect(
      (await notes.linkCandidates(ana, { type: 'note', id: a.id }, 'debug')).map((c) => c.title),
    ).toEqual(['Debug de jobs']);
    // A trashed note disappears from the links; unlinking removes the pair.
    await notes.trashNote(ana, b.id);
    expect(await notes.linksOf(ana, { type: 'note', id: a.id })).toEqual([]);
    await notes.unlinkItems(ana, { type: 'note', id: a.id }, { type: 'note', id: b.id });
    const [{ n }] = (await admin`select count(*)::int as n from item_links`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });

  it('tasks: private, subtasks, repetition, Trash and links with notes', async () => {
    const ana = await signedIn('ana@tasks.pt');
    const rui = await signedIn('rui@tasks.pt');
    const t = await tasksSvc.createTask(ana, { title: 'Revisão semanal', type: 'mgmt' });
    expect(t).toMatchObject({ type: 'mgmt', priority: 'medium', repeat: 'none', doneAt: null });

    // Rui sees nothing and can't touch Ana's task or its subtasks.
    expect(await tasksSvc.listTasks(rui)).toEqual([]);
    expect(await codeOf(tasksSvc.getTask(rui, t.id))).toBe('not_found');
    expect(await codeOf(tasksSvc.updateTask(rui, t.id, { title: 'x' }))).toBe('not_found');
    expect(await codeOf(tasksSvc.addSubtask(rui, t.id, 'x'))).toBe('not_found');

    let full = await tasksSvc.addSubtask(ana, t.id, 'Ver dumps');
    full = await tasksSvc.addSubtask(ana, t.id, 'Limpar logs');
    full = await tasksSvc.updateSubtask(ana, t.id, full.subtasks[0]!.id, { done: true });
    expect(full.subs).toEqual({ done: 1, total: 2 });
    expect(await codeOf(tasksSvc.updateSubtask(rui, t.id, full.subtasks[0]!.id, { done: false }))).toBe(
      'not_found',
    );
    expect((await tasksSvc.listTasks(ana))[0]!.subs).toEqual({ done: 1, total: 2 });

    // Completing a weekly task creates the next one (subtasks unticked, due + 7 days).
    await tasksSvc.updateTask(ana, t.id, { repeat: 'weekly', dueOn: '2026-10-06', priority: 'high' });
    const r = await tasksSvc.updateTask(ana, t.id, { done: true });
    expect(r.task.doneAt).not.toBeNull();
    expect(r.task.repeat).toBe('none');
    expect(r.next).toMatchObject({
      title: 'Revisão semanal',
      dueOn: '2026-10-13',
      repeat: 'weekly',
      priority: 'high',
      doneAt: null,
    });
    expect(r.next!.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['Ver dumps', false],
      ['Limpar logs', false],
    ]);
    // Reopening doesn't spawn another.
    const again = await tasksSvc.updateTask(ana, t.id, { done: false });
    expect(again.next).toBeNull();
    expect(again.task.doneAt).toBeNull();

    // Links between a note and a task, in both directions.
    const n = await notes.createNote(ana, { title: 'Dumps' });
    await notes.linkItems(ana, { type: 'note', id: n.id }, { type: 'task', id: t.id });
    expect(await notes.linksOf(ana, { type: 'task', id: t.id })).toEqual([
      { type: 'note', id: n.id, title: 'Dumps' },
    ]);
    expect(
      (await notes.linkCandidates(ana, { type: 'note', id: n.id }, 'revis')).map((c) => [c.type, c.title]),
    ).toEqual([
      ['task', 'Revisão semanal'],
      ['task', 'Revisão semanal'],
    ]);
    expect(
      await codeOf(notes.linkItems(rui, { type: 'task', id: t.id }, { type: 'task', id: r.next!.id })),
    ).toBe('not_found');

    // Trash: task deleted, listed, restored, purged with its links and subtasks.
    await tasksSvc.trashTask(ana, t.id);
    expect((await notes.listTrash(ana)).map((x) => [x.kind, x.title])).toEqual([['task', 'Revisão semanal']]);
    await notes.restoreTrash(ana, [{ kind: 'task', id: t.id }]);
    expect((await tasksSvc.getTask(ana, t.id)).title).toBe('Revisão semanal');
    await tasksSvc.trashTask(ana, t.id);
    await notes.purgeTrash(ana, [{ kind: 'task', id: t.id }]);
    const [{ n: left }] =
      (await admin`select count(*)::int as n from task_subtasks where task_id = ${t.id}`) as unknown as [
        { n: number },
      ];
    expect(left).toBe(0);
    expect(await notes.linksOf(ana, { type: 'note', id: n.id })).toEqual([]);
    expect(await notes.contentCounts(ana, new Set(['notes', 'tasks']))).toEqual({ notes: 1, tasks: 1 });
  });

  it('voice notes: audio checked by its bytes, private, transcript by hand, Trash removes the file', async () => {
    const ana = await signedIn('ana@voice.pt');
    const rui = await signedIn('rui@voice.pt');
    const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(64).fill(7)]);
    expect(
      await codeOf(
        voiceSvc.createVoice(ana, {
          title: 'x',
          kind: 'mic',
          durationMs: 1,
          levels: [],
          data: new TextEncoder().encode('<html>hello there'),
        }),
      ),
    ).toBe('unsupported_audio');
    const v = await voiceSvc.createVoice(ana, {
      title: 'Daily · FI',
      kind: 'pc',
      durationMs: 252_000,
      levels: [0.5, 2, -1, 'x', 0.25],
      data: webm,
    });
    expect(v).toMatchObject({
      kind: 'pc',
      mime: 'audio/webm',
      durationMs: 252_000,
      levels: [0.5, 1, 0, 0, 0.25],
    });
    expect((await voiceSvc.readVoiceAudio(ana, v.id))?.body.length).toBe(webm.length);
    expect(await voiceSvc.readVoiceAudio(rui, v.id)).toBeNull();
    expect(await voiceSvc.listVoice(rui)).toEqual([]);
    expect(await codeOf(voiceSvc.updateVoice(rui, v.id, { transcript: 'x' }))).toBe('not_found');

    const u = await voiceSvc.updateVoice(ana, v.id, { transcript: '0:00 Bom dia a todos.', pinned: true });
    expect(u).toMatchObject({ transcript: '0:00 Bom dia a todos.', pinned: true });

    // Links with a task; Trash; purge removes the recording from storage.
    const t = await tasksSvc.createTask(ana, { title: 'Validar BAdI' });
    await notes.linkItems(ana, { type: 'task', id: t.id }, { type: 'voice', id: v.id });
    expect(await notes.linksOf(ana, { type: 'task', id: t.id })).toEqual([
      { type: 'voice', id: v.id, title: 'Daily · FI' },
    ]);
    await voiceSvc.trashVoice(ana, v.id);
    expect((await notes.listTrash(ana)).map((x) => x.kind)).toEqual(['voice']);
    await notes.purgeTrash(ana, 'all');
    expect(await voiceSvc.readVoiceAudio(ana, v.id)).toBeNull();
    expect(await notes.linksOf(ana, { type: 'task', id: t.id })).toEqual([]);
    expect(await notes.contentCounts(ana, new Set(['voice']))).toEqual({ voice: 0 });
  });

  it('Início data: active tasks, recent and favourite notes, only for the modules in the plan', async () => {
    const ana = await signedIn('ana@home.pt');
    const rui = await signedIn('rui@home.pt');
    const f = await notes.createFolder(ana, 'Performance');
    const n1 = await notes.createNote(ana, { folderId: f.id, title: 'FOR ALL ENTRIES' });
    await notes.updateNote(ana, n1.id, { favorite: true });
    await notes.createNote(ana, { title: 'Solta' });
    const t1 = await tasksSvc.createTask(ana, { title: 'Ativar Logs', dueOn: '2026-10-20' });
    const t2 = await tasksSvc.createTask(ana, { title: 'Feita' });
    await tasksSvc.updateTask(ana, t2.id, { done: true });

    const d = await homeSvc.homeData(ana, new Set(['notes', 'tasks']));
    expect(d.tasks?.map((x) => [x.title, x.dueOn])).toEqual([['Ativar Logs', '2026-10-20']]);
    expect(d.recentNotes?.map((x) => [x.title, x.folder])).toEqual([
      ['Solta', null],
      ['FOR ALL ENTRIES', 'Performance'],
    ]);
    expect(d.favNotes).toEqual([{ id: n1.id, title: 'FOR ALL ENTRIES' }]);
    expect(await homeSvc.homeData(ana, new Set(['tasks']))).toEqual({ tasks: d.tasks });
    expect(await homeSvc.homeData(rui, new Set(['notes', 'tasks']))).toEqual({
      tasks: [],
      recentNotes: [],
      favNotes: [],
    });
    expect(t1.dueOn).toBe('2026-10-20');
  });

  it('tags: listed with counts, renamed in every note, merged when the new name exists', async () => {
    const ana = await signedIn('ana@tags.pt');
    const rui = await signedIn('rui@tags.pt');
    const a = await notes.createNote(ana, { title: 'A' });
    const b = await notes.createNote(ana, { title: 'B' });
    await notes.updateNote(ana, a.id, { tags: ['SELECT', 'Performance'] });
    await notes.updateNote(ana, b.id, { tags: ['Performance', 'perf'] });
    const r = await notes.createNote(rui, { title: 'R' });
    await notes.updateNote(rui, r.id, { tags: ['Performance'] });

    expect(await notes.listTags(ana)).toEqual([
      { name: 'perf', count: 1 },
      { name: 'Performance', count: 2 },
      { name: 'SELECT', count: 1 },
    ]);
    expect(await notes.renameTag(ana, 'SELECT', 'Select')).toEqual({ renamed: 1 });
    expect(await notes.renameTag(ana, 'perf', 'Performance')).toEqual({ renamed: 1 }); // merge
    expect((await notes.getNote(ana, b.id)).tags).toEqual(['Performance']);
    expect(await notes.listTags(ana)).toEqual([
      { name: 'Performance', count: 2 },
      { name: 'Select', count: 1 },
    ]);
    expect(await codeOf(notes.renameTag(ana, 'nao-existe', 'x'))).toBe('not_found');
    // Rui's notes are untouched.
    expect(await notes.listTags(rui)).toEqual([{ name: 'Performance', count: 1 }]);
  });

  it('vault: ciphertext only, private to its owner, optimistic versions, wipe', async () => {
    const a = await signedIn('vault-a@example.pt');
    const b = await signedIn('vault-b@example.pt');
    const keys = {
      kdfSalt: 'c2FsdHNhbHRzYWx0c2FsdA==',
      kdfParams: { alg: 'argon2id' as const, m: 65536, t: 3, p: 1 },
      dekWrappedMp: 'd3JhcHBlZE1Q',
      dekWrappedRk: 'd3JhcHBlZFJL',
      rkFingerprint: 'ABCD 1234 EF01 5678',
    };
    expect((await vault.getVault(a)).keys).toBeNull();
    expect(await codeOf(vault.createVaultItem(a, 'Y3Q='))).toBe('vault_missing');
    await vault.setupVault(a, keys);
    expect(await codeOf(vault.setupVault(a, keys))).toBe('vault_exists');

    const it1 = await vault.createVaultItem(a, 'Y3QxCg==');
    expect(it1.version).toBe(1);
    const up = await vault.updateVaultItem(a, it1.id, 'Y3QyCg==', 1);
    expect(up.version).toBe(2);
    // a second device still editing version 1 is refused and gets the current copy
    const stale = await vault.updateVaultItem(a, it1.id, 'Y3QzCg==', 1).catch((e: unknown) => e);
    expect(stale).toMatchObject({ code: 'version_conflict', status: 409 });

    // another user sees nothing and cannot touch the item
    expect(await vault.getVault(b)).toEqual({ keys: null, items: [] });
    expect(await codeOf(vault.updateVaultItem(b, it1.id, 'eA==', 2))).toBe('not_found');
    expect(await codeOf(vault.deleteVaultItem(b, it1.id))).toBe('not_found');

    // re-wrap keeps the items; a new recovery key moves its date
    await vault.updateVaultKeys(
      a,
      { dekWrappedRk: 'bmV3Uks=', rkFingerprint: 'FFFF 0000 FFFF 0000' },
      'vault.recovery_key_regenerated',
    );
    await vault.saveVaultMeta(a, 'bWV0YQ==');
    const v = await vault.getVault(a);
    expect(v.keys).toMatchObject({
      dekWrappedRk: 'bmV3Uks=',
      rkFingerprint: 'FFFF 0000 FFFF 0000',
      metaCt: 'bWV0YQ==',
    });
    expect(v.items.map((x) => [x.ciphertext, x.version])).toEqual([['Y3QyCg==', 2]]);

    await vault.wipeVault(a);
    expect(await vault.getVault(a)).toEqual({ keys: null, items: [] });
  });

  it('emails: .eml and .msg imported on the server, private files, folders, task, Trash', async () => {
    const { EML } = await import('../fixtures/sample-eml');
    const a = await signedIn('mail-a@example.pt');
    const b = await signedIn('mail-b@example.pt');
    const f = await mail.createEmailFolder(a, 'Cliente Banco SOL');
    const e1 = await mail.importEmail(a, {
      fileName: 'cutover.eml',
      data: new TextEncoder().encode(EML),
      folderId: f.id,
    });
    expect(e1).toMatchObject({
      subject: 'Plano de cutover — S/4HANA',
      fromName: 'Ana Silva',
      folderId: f.id,
      attachments: 1,
    });
    const msg = new Uint8Array(await fs.readFile('tests/fixtures/sample.msg'));
    const e2 = await mail.importEmail(a, { fileName: 'plano.msg', data: msg });
    expect(e2.subject).toBe('Plano de cutover — SAP S/4HANA');
    expect(await codeOf(mail.importEmail(a, { fileName: 'x.eml', data: new Uint8Array([1, 2, 3]) }))).toBe(
      'unreadable_email',
    );
    expect(
      await codeOf(
        mail.importEmail(b, { fileName: 'x.eml', data: new TextEncoder().encode(EML), folderId: f.id }),
      ),
    ).toBe('folder_not_found');

    const full = await mail.getEmail(a, e1.id);
    expect(full.html).toContain('data:image/png;base64,');
    expect(full.files.map((x) => x.name)).toEqual(['plano.pdf']);
    const att = await mail.readEmailAttachment(a, e1.id, full.files[0]!.id);
    expect(new TextDecoder().decode(att!.body)).toBe('%PDF-1.4\n');
    expect((await mail.readEmailOriginal(a, e2.id))!.body.length).toBe(msg.length);

    // another user: nothing visible, nothing readable
    expect(await mail.listEmails(b)).toEqual([]);
    expect(await codeOf(mail.getEmail(b, e1.id))).toBe('not_found');
    expect(await mail.readEmailAttachment(b, e1.id, full.files[0]!.id)).toBeNull();
    expect(await mail.readEmailOriginal(b, e1.id)).toBeNull();

    const up = await mail.updateEmail(a, e2.id, {
      starred: true,
      pinned: true,
      notes: 'rever',
      folderId: f.id,
    });
    expect(up).toMatchObject({ starred: true, pinned: true, notes: 'rever', folderId: f.id });
    const task = await mail.emailToTask(a, e2.id, 'pt');
    expect(task.title).toBe('Plano de cutover — SAP S/4HANA');
    expect(task.notes).toContain('Email: Ana Silva <ana.silva@cliente.pt>');

    // removing the folder keeps the emails
    await mail.deleteEmailFolder(a, f.id);
    expect((await mail.listEmails(a)).map((x) => x.folderId)).toEqual([null, null]);

    // Trash: restore, then purge removes the stored files
    await mail.trashEmail(a, e1.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'email',
      'Plano de cutover — S/4HANA',
    ]);
    await notes.restoreTrash(a, [{ kind: 'email', id: e1.id }]);
    expect((await mail.listEmails(a)).length).toBe(2);
    await mail.trashEmail(a, e1.id);
    await notes.purgeTrash(a, 'all');
    expect(await codeOf(mail.getEmail(a, e1.id))).toBe('not_found');
    const counts = await notes.contentCounts(a, new Set(['emails']));
    expect(counts.emails).toBe(1);
  });

  it('issues: private, status keeps the completion date, links, Trash, Início and counts', async () => {
    const a = await signedIn('issues-a@example.pt');
    const b = await signedIn('issues-b@example.pt');
    const i1 = await iss.createIssue(a, { title: 'IDoc ORDERS05 em erro 51', dueOn: '2026-10-20' });
    expect(i1).toMatchObject({ status: 'open', priority: 'medium', doneAt: null, dueOn: '2026-10-20' });
    const i2 = await iss.createIssue(a, { title: 'Autorizações F110', status: 'waiting' });

    expect(await iss.listIssues(b)).toEqual([]);
    expect(await codeOf(iss.updateIssue(b, i1.id, { status: 'done' }))).toBe('not_found');

    const up = await iss.updateIssue(a, i1.id, {
      priority: 'critical',
      waiting: 'Equipa Basis',
      description: 'x',
    });
    expect(up).toMatchObject({ priority: 'critical', waiting: 'Equipa Basis' });
    const done = await iss.updateIssue(a, i1.id, { status: 'done' });
    expect(done.doneAt).not.toBeNull();
    const still = await iss.updateIssue(a, i1.id, { status: 'done', notes: 'fechado' });
    expect(still.doneAt).toBe(done.doneAt);
    expect((await iss.updateIssue(a, i1.id, { status: 'progress' })).doneAt).toBeNull();

    const t = await tasksSvc.createTask(a, { title: 'Reprocessar IDocs' });
    await notes.linkItems(a, { type: 'issue', id: i1.id }, { type: 'task', id: t.id });
    expect((await notes.linksOf(a, { type: 'task', id: t.id })).map((x) => [x.type, x.title])).toEqual([
      ['issue', 'IDoc ORDERS05 em erro 51'],
    ]);
    const counts = await notes.contentCounts(a, new Set(['issues']));
    expect(counts.issues).toBe(2);
    const home = await homeSvc.homeData(a, new Set(['issues']));
    expect(home.issues?.map((x) => x.title).sort()).toEqual([
      'Autorizações F110',
      'IDoc ORDERS05 em erro 51',
    ]);

    await iss.trashIssue(a, i2.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'issue',
      'Autorizações F110',
    ]);
    await notes.restoreTrash(a, [{ kind: 'issue', id: i2.id }]);
    await iss.trashIssue(a, i1.id);
    await notes.purgeTrash(a, [{ kind: 'issue', id: i1.id }]);
    expect((await iss.listIssues(a)).map((x) => x.title)).toEqual(['Autorizações F110']);
    expect(await notes.linksOf(a, { type: 'task', id: t.id })).toEqual([]);
  });

  it('artifacts: private, a version per save, restore keeps history, folders, links, Trash', async () => {
    const a = await signedIn('art-a@example.pt');
    const b = await signedIn('art-b@example.pt');
    const f = await art.createArtifactFolder(a, 'Demos');
    const a1 = await art.createArtifact(a, { title: 'Dashboard <SAP>', folderId: f.id });
    expect(a1.html).toContain('<h1>Dashboard &#60;SAP&#62;</h1>');
    expect(a1.versions).toHaveLength(1);
    expect(await codeOf(art.createArtifact(b, { title: 'x', folderId: f.id }))).toBe('folder_not_found');

    const v2 = await art.saveArtifactHtml(a, a1.id, '<p>v2</p>');
    expect(v2.versions.map((v) => v.current)).toEqual([false, true]);
    const back = await art.restoreArtifactVersion(a, a1.id, v2.versions[0]!.id);
    expect(back.html).toBe(a1.html);
    expect(back.versions).toHaveLength(3);
    expect(await codeOf(art.restoreArtifactVersion(a, a1.id, '00000000-0000-7000-8000-000000000000'))).toBe(
      'not_found',
    );

    const up = await art.updateArtifact(a, a1.id, {
      tags: ['SAP', 'Demo'],
      description: 'KPIs',
      pinned: true,
    });
    expect(up).toMatchObject({ tags: ['SAP', 'Demo'], description: 'KPIs', pinned: true });

    expect(await art.listArtifacts(b)).toEqual([]);
    expect(await codeOf(art.getArtifact(b, a1.id))).toBe('not_found');
    expect(await art.artifactHtml(b, a1.id)).toBeNull();
    expect(await codeOf(art.saveArtifactHtml(b, a1.id, 'x'))).toBe('not_found');

    const n = await notes.createNote(a, { title: 'Notas da demo' });
    await notes.linkItems(a, { type: 'artifact', id: a1.id }, { type: 'note', id: n.id });
    expect((await notes.linksOf(a, { type: 'note', id: n.id })).map((x) => x.type)).toEqual(['artifact']);
    expect((await notes.contentCounts(a, new Set(['artifacts']))).artifacts).toBe(1);

    await art.deleteArtifactFolder(a, f.id);
    expect((await art.listArtifacts(a))[0]!.folderId).toBeNull();
    await art.trashArtifact(a, a1.id);
    expect((await notes.listTrash(a)).map((x) => x.kind)).toContain('artifact');
    await notes.purgeTrash(a, 'all');
    expect(await codeOf(art.getArtifact(a, a1.id))).toBe('not_found');
    expect(await notes.linksOf(a, { type: 'note', id: n.id })).toEqual([]);
  });

  it('code library: snippets with files, related both ways, private, Trash purge drops references', async () => {
    const a = await signedIn('dev-a@example.pt');
    const b = await signedIn('dev-b@example.pt');
    const s1 = await snip.createSnippet(a, {
      title: 'Função debounce',
      type: 'function',
      lang: 'javascript',
    });
    expect(s1.files).toEqual([{ id: 'f1', name: 'funcao-debounce.js', lang: 'javascript', code: '' }]);
    const s2 = await snip.createSnippet(a, { title: 'Imagem', type: 'config', lang: 'dockerfile' });
    expect(s2.files[0]!.name).toBe('Dockerfile');
    const other = await snip.createSnippet(b, { title: 'Alheio', type: 'snippet', lang: 'plain' });

    const up = await snip.updateSnippet(a, s1.id, {
      files: [
        { id: 'f1', name: 'debounce.js', lang: 'javascript', code: 'export const x = 1;' },
        { id: 'f2', name: 'debounce.test.js', lang: 'javascript', code: '' },
      ],
      tags: ['utils'],
      fav: true,
      related: [s2.id, other.id, s1.id], // another user's snippet and itself are ignored
    });
    expect(up.related).toEqual([s2.id]);
    expect(up.files).toHaveLength(2);
    const list = await snip.listSnippets(a);
    expect(list.find((x) => x.id === s2.id)!.related).toEqual([s1.id]);
    expect(await snip.listSnippets(b)).toHaveLength(1);
    expect(await codeOf(snip.updateSnippet(b, s1.id, { fav: false }))).toBe('not_found');

    await snip.updateSnippet(a, s1.id, { related: [] });
    expect((await snip.listSnippets(a)).find((x) => x.id === s2.id)!.related).toEqual([]);
    await snip.updateSnippet(a, s1.id, { related: [s2.id] });

    await snip.trashSnippet(a, s2.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual(['snippet', 'Imagem']);
    await notes.purgeTrash(a, 'all');
    expect((await snip.listSnippets(a)).map((x) => [x.title, x.related])).toEqual([['Função debounce', []]]);
    expect((await notes.contentCounts(a, new Set(['devlib']))).devlib).toBe(1);
  });

  it('api playground: requests and envs are private, secrets encrypted, proxy refuses private hosts', async () => {
    const a = await signedIn('api-a@example.pt');
    const b = await signedIn('api-b@example.pt');
    const f = await apip.createApiFolder(a, 'SuccessFactors');
    const r = await apip.createApiRequest(a, { title: 'Ler utilizadores', folderId: f.id });
    expect(r).toMatchObject({ method: 'GET', url: '{{host}}/', folderId: f.id });
    expect(r.headers).toEqual([{ k: 'Accept', v: 'application/json', on: true }]);

    const up = await apip.updateApiRequest(a, r.id, {
      method: 'POST',
      url: '{{host}}/odata/v2/User',
      params: [{ k: '$top', v: '5', on: true }],
      authType: 'bearer',
      auth: { token: 'segredo-123', user: '', pass: '' },
    });
    expect(up.auth.token).toBe('segredo-123');
    const [raw] = await admin`select auth_ct from api_requests where id = ${r.id}`;
    expect(String(raw!.auth_ct)).not.toContain('segredo');

    const envs = await apip.listApiEnvs(a);
    expect(envs.map((e) => e.name)).toEqual(['DEV', 'QAS', 'PRD']);
    await apip.updateApiEnv(a, envs[0]!.id, [{ k: 'host', v: 'https://api.example.com', on: true }]);
    expect((await apip.listApiEnvs(a))[0]!.vars[0]!.v).toBe('https://api.example.com');
    const [rawEnv] = await admin`select vars_ct from api_envs where id = ${envs[0]!.id}`;
    expect(String(rawEnv!.vars_ct)).not.toContain('example.com');

    expect(await apip.listApiRequests(b)).toEqual([]);
    expect(await codeOf(apip.updateApiRequest(b, r.id, { title: 'x' }))).toBe('not_found');
    expect(await codeOf(apip.updateApiEnv(b, envs[0]!.id, []))).toBe('not_found');

    const copy = await apip.duplicateApiRequest(a, r.id, ' (cópia)');
    expect(copy).toMatchObject({
      title: 'Ler utilizadores (cópia)',
      method: 'POST',
      auth: { token: 'segredo-123' },
    });

    const sent = await apip.sendApiRequest(a, { method: 'GET', url: 'http://127.0.0.1:3100/', headers: [] });
    expect(sent).toEqual({ ok: false, reason: 'blocked_address', message: undefined });
    const [log] = await admin`select details from audit_log where action = 'api.blocked'`;
    expect(log!.details).toEqual({ host: '127.0.0.1:3100' });

    await apip.deleteApiFolder(a, f.id);
    expect((await apip.listApiRequests(a)).every((x) => x.folderId === null)).toBe(true);
    await apip.trashApiRequest(a, copy.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'request',
      'Ler utilizadores (cópia)',
    ]);
    expect((await notes.contentCounts(a, new Set(['api']))).api).toBe(1);
    await notes.purgeTrash(a, 'all');
    expect((await apip.listApiRequests(a)).map((x) => x.title)).toEqual(['Ler utilizadores']);
  });

  it('whiteboard: boards are private, conflict on stale saves, images copied on duplicate, items and Trash', async () => {
    const a = await signedIn('wb-a@example.pt');
    const b = await signedIn('wb-b@example.pt');
    const note = await notes.createNote(a, { title: 'Go-live SF' });
    const task = await tasksSvc.createTask(a, { title: 'Transportar a ordem' });
    await tasksSvc.addSubtask(a, task.id, 'Criar destination');
    const board = await wb.createBoard(a, 'Brainstorm');
    const img = await wb.addBoardImage(a, board.id, PNG);
    expect(await codeOf(wb.addBoardImage(b, board.id, PNG))).toBe('not_found');
    expect(await codeOf(wb.addBoardImage(a, board.id, new TextEncoder().encode('<svg/>')))).toBe(
      'unsupported_image',
    );
    const els = [
      {
        id: 'r1',
        t: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        stroke: '#fbf8f5',
        fill: 'none',
        sw: 4,
        dash: 'solid',
        fs: 18,
        text: 'Análise',
      },
      { id: 'k1', t: 'link', x: 200, y: 0, w: 270, h: 78, ref: `note:${note.id}` },
      { id: 'k2', t: 'link', x: 200, y: 100, w: 270, h: 78, ref: `task:${task.id}` },
      { id: 'i1', t: 'image', x: 0, y: 100, w: 100, h: 100, file: img },
    ] as never[];
    const s1 = await wb.updateBoard(a, board.id, { els, base: board.updatedAt });
    expect(s1.updatedAt > board.updatedAt).toBe(true);

    // a second tab still holding the old updated_at is refused, unless it insists
    expect(await codeOf(wb.updateBoard(a, board.id, { name: 'Outro', base: board.updatedAt }))).toBe(
      'conflict',
    );
    const s2 = await wb.updateBoard(a, board.id, { name: 'Outro', base: board.updatedAt, force: true });
    await wb.updateBoard(a, board.id, { name: 'Brainstorm', base: s2.updatedAt });

    const types = ['note', 'task', 'voice', 'issue', 'artifact', 'snippet'] as const;
    const list = await wb.listBoards(a, [...types]);
    expect(list.boards.map((x) => [x.name, x.els.length])).toEqual([['Brainstorm', 4]]);
    expect(
      Object.values(list.items)
        .map((x) => x.title)
        .sort(),
    ).toEqual(['Go-live SF', 'Transportar a ordem']);
    expect((await wb.listBoards(a, ['task'])).items).not.toHaveProperty(`note:${note.id}`);
    expect((await wb.listBoards(b, [...types])).boards).toEqual([]);
    expect(await codeOf(wb.updateBoard(b, board.id, { name: 'x' }))).toBe('not_found');
    expect(await wb.readBoardImage(b, img)).toBeNull();
    expect((await wb.readBoardImage(a, img))?.mime).toBe('image/png');

    expect((await wb.boardItems(a, 'go-live', [...types])).map((x) => x.k)).toEqual([`note:${note.id}`]);
    expect(await wb.boardItems(b, '', [...types])).toEqual([]);
    const peek = await wb.peekItem(a, 'task', task.id);
    expect(peek).toMatchObject({
      title: 'Transportar a ordem',
      subs: [{ t: 'Criar destination', done: false }],
      code: false,
    });
    expect(await codeOf(wb.peekItem(b, 'task', task.id))).toBe('not_found');

    const copy = await wb.duplicateBoard(a, board.id, ' (cópia)');
    const copyImg = copy.els.find((e) => e.t === 'image') as { file: string };
    expect(copy.name).toBe('Brainstorm (cópia)');
    expect(copyImg.file).not.toBe(img);
    expect((await wb.readBoardImage(a, copyImg.file))?.mime).toBe('image/png');

    await wb.trashBoard(a, board.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual(['board', 'Brainstorm']);
    await notes.restoreTrash(a, [{ kind: 'board', id: board.id }]);
    expect((await wb.listBoards(a, [])).boards).toHaveLength(2);
    await wb.trashBoard(a, board.id);
    await notes.purgeTrash(a, 'all');
    expect(await wb.readBoardImage(a, img)).toBeNull();
    expect((await wb.readBoardImage(a, copyImg.file))?.mime).toBe('image/png');
    expect((await wb.listBoards(a, [])).boards.map((x) => x.name)).toEqual(['Brainstorm (cópia)']);
  });

  it('sap: systems and transactions are shared by the tenant, favourites and usage per user, Trash', async () => {
    const a = await signedIn('sap-a@example.pt');
    const other = await signedIn('sap-b@example.pt');
    const [cl] =
      await admin`insert into mg_clients (tenant_id, name) values (${a.tenant.id}, 'Banco SOL') returning id`;
    expect((await sapSvc.listClients(a)).map((c) => c.name)).toEqual(['Banco SOL']);
    expect(await sapSvc.listClients(other)).toEqual([]);

    const s = await sapSvc.createSystem(a, {
      name: 'BSD - DEV',
      sid: 'bsd',
      env: 'DEV',
      clientId: cl!.id as string,
    });
    expect(s).toMatchObject({ sid: 'BSD', env: 'DEV', mandt: '100', inst: '00', fav: false });
    expect(
      await codeOf(sapSvc.createSystem(a, { name: 'x', clientId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })),
    ).toBe('client_not_found');
    await sapSvc.setSystemFav(a, s.id, true);
    expect((await sapSvc.listSystems(a))[0]!.fav).toBe(true);
    expect(await sapSvc.listSystems(other)).toEqual([]);
    expect(await codeOf(sapSvc.updateSystem(other, s.id, { name: 'x' }))).toBe('not_found');
    const up = await sapSvc.updateSystem(a, s.id, { host: '172.16.23.1', env: 'QAS' });
    expect(up).toMatchObject({ host: '172.16.23.1', env: 'QAS', fav: true });

    // the prototype catalogue is given once per tenant; favourites start for the first user
    const tx1 = await sapSvc.listTcodes(a);
    expect(tx1).toHaveLength(23);
    expect(
      tx1
        .filter((x) => x.fav)
        .map((x) => x.code)
        .sort(),
    ).toEqual(['SE09', 'SE16N', 'SE38', 'ST22']);
    expect(await sapSvc.listTcodes(a)).toHaveLength(23);
    const se38 = tx1.find((x) => x.code === 'SE38')!;
    await sapSvc.touchTcode(a, se38.id, { use: true });
    await sapSvc.touchTcode(a, se38.id, { use: true });
    await sapSvc.touchTcode(a, se38.id, { fav: false });
    expect((await sapSvc.listTcodes(a)).find((x) => x.id === se38.id)).toMatchObject({ uses: 2, fav: false });
    expect((await sapSvc.listTcodes(other)).find((x) => x.id === se38.id)).toBeUndefined();
    const z = await sapSvc.createTcode(a, { code: 'zfi_x', program: 'sm30', type: 'param' });
    expect(z).toMatchObject({ code: 'ZFI_X', program: 'SM30', module: 'BC' });

    await sapSvc.trashSystem(a, s.id);
    await sapSvc.trashTcode(a, z.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toEqual(
      expect.arrayContaining([
        ['system', 'BSD - DEV'],
        ['tcode', 'ZFI_X'],
      ]),
    );
    await notes.restoreTrash(a, [{ kind: 'system', id: s.id }]);
    expect((await sapSvc.listSystems(a))[0]!.fav).toBe(true);
    await notes.purgeTrash(a, 'all');
    expect((await sapSvc.listTcodes(a)).some((x) => x.id === z.id)).toBe(false);
    const home = await homeSvc.homeData(a, new Set(['tcodes', 'systems']));
    expect(home.systems?.map((x) => [x.sid, x.client])).toEqual([['BSD', 'Banco SOL']]);
    expect(home.tcodes?.map((x) => x.code)).toEqual(['SE09', 'SE16N', 'ST22']);
  });

  it('transports: number from the DEV system, client follows the system, steps stamped by the server, Trash', async () => {
    const a = await signedIn('ot-a@example.pt');
    const b = await signedIn('ot-b@example.pt');
    const [cl] =
      await admin`insert into mg_clients (tenant_id, name) values (${a.tenant.id}, 'Grupo ID') returning id`;
    const dev = await sapSvc.createSystem(a, {
      name: 'ECP - DEV',
      sid: 'JOG',
      env: 'DEV',
      clientId: cl!.id as string,
    });
    const t1 = await otSvc.createTransport(a, { systemId: dev.id });
    expect(t1).toMatchObject({ trkorr: 'JOGK9', clientId: cl!.id, type: 'W', releasedAt: null });
    const up = await otSvc.updateTransport(a, t1.id, {
      trkorr: 'jogk900700',
      description: 'Carregamento T5P6NP',
      steps: { released: true, qas: true },
    });
    expect(up.trkorr).toBe('JOGK900700');
    expect(up.releasedAt && up.qasAt && !up.prdAt).toBeTruthy();
    const off = await otSvc.updateTransport(a, t1.id, { steps: { qas: false, junk: true } });
    expect([off.qasAt, !!off.junkAt]).toEqual([null, true]);
    expect(await otSvc.listTransports(b)).toEqual([]);
    expect(await codeOf(otSvc.updateTransport(b, t1.id, { notes: 'x' }))).toBe('not_found');
    expect(await codeOf(otSvc.createTransport(b, { systemId: dev.id }))).toBe('system_not_found');

    const home = await homeSvc.homeData(a, new Set(['transports']));
    expect(home.transports).toEqual([]); // junk is not "in progress"
    await otSvc.updateTransport(a, t1.id, { steps: { junk: false } });
    expect(
      (await homeSvc.homeData(a, new Set(['transports']))).transports?.map((x) => [x.trkorr, x.released]),
    ).toEqual([['JOGK900700', true]]);

    await otSvc.trashTransport(a, t1.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'transport',
      'JOGK900700 · Carregamento T5P6NP',
    ]);
    await notes.purgeTrash(a, 'all');
    expect(await otSvc.listTransports(a)).toEqual([]);
  });

  it('codelib: shared by the tenant, conflict by updatedAt, duplicate, links to notes and transports, Trash', async () => {
    const a = await signedIn('cl-a@example.pt');
    const b = await signedIn('cl-b@example.pt');
    const prog = await cl.createObject(a, { type: 'PROG', name: 'zhr pt recibos' });
    expect(prog).toMatchObject({ type: 'PROG', name: 'ZHR_PT_RECIBOS', tags: [] });
    expect(prog.nodes.map((n) => n.id)).toEqual(['main', 'attr', 'sym', 'selt', 'var']);
    const snip = await cl.createObject(a, { type: 'SNIP', name: '  ALV rápido ' });
    expect(snip.name).toBe('ALV rápido');

    const nodes = prog.nodes.map((n) =>
      n.id === 'main'
        ? { ...n, tabs: [{ k: 'code' as const, view: 'code' as const, code: 'REPORT zhr_pt_recibos.' }] }
        : n,
    );
    const up = await cl.updateObject(a, prog.id, {
      description: 'Envio de recibos',
      tags: ['HCM', ' HCM ', 'Recibos'],
      nodes,
      base: prog.updatedAt,
    });
    expect(up.tags).toEqual(['HCM', 'Recibos']);
    // a second editor still holding the old version gets a conflict, unless forced
    expect(await codeOf(cl.updateObject(a, prog.id, { description: 'x', base: prog.updatedAt }))).toBe(
      'conflict',
    );
    const forced = await cl.updateObject(a, prog.id, {
      description: 'Forçado',
      base: prog.updatedAt,
      force: true,
    });
    expect(forced.description).toBe('Forçado');
    expect(forced.updatedAt > up.updatedAt).toBe(true);

    const dup = await cl.duplicateObject(a, prog.id);
    expect(dup).toMatchObject({
      name: 'ZHR_PT_RECIBOS_COPY',
      description: 'Forçado',
      tags: ['HCM', 'Recibos'],
    });
    expect((dup.nodes[0]!.tabs[0] as { code: string }).code).toBe('REPORT zhr_pt_recibos.');
    expect((await cl.duplicateObject(a, snip.id)).name).toBe('ALV rápido (2)');

    // other tenants see nothing
    expect(await cl.listObjects(b)).toEqual([]);
    expect(await codeOf(cl.updateObject(b, prog.id, { description: 'x' }))).toBe('not_found');
    expect(await codeOf(cl.trashObject(b, prog.id))).toBe('not_found');

    // links: "Ligações" and "Ordens de Transporte" of the object
    const n = await notes.createNote(a, { title: 'Recibos — notas de go-live' });
    const sys = await sapSvc.createSystem(a, { name: 'ECP - DEV', sid: 'JOG', env: 'DEV' });
    const tr = await otSvc.createTransport(a, { systemId: sys.id });
    await otSvc.updateTransport(a, tr.id, {
      trkorr: 'JOGK900710',
      description: 'Recibos',
      steps: { released: true },
    });
    await notes.linkItems(a, { type: 'code', id: prog.id }, { type: 'note', id: n.id });
    await notes.linkItems(a, { type: 'code', id: prog.id }, { type: 'transport', id: tr.id });
    expect(
      (await notes.linksOf(a, { type: 'code', id: prog.id })).map((l) => [l.type, l.title, l.stage ?? null]),
    ).toEqual(
      expect.arrayContaining([
        ['note', 'Recibos — notas de go-live', null],
        ['transport', 'JOGK900710', 'rel'],
      ]),
    );
    expect((await notes.linksOf(a, { type: 'note', id: n.id })).map((l) => [l.type, l.title, l.sub])).toEqual(
      [['code', 'ZHR_PT_RECIBOS', 'PROG · Forçado']],
    );
    const cands = await notes.linkCandidates(a, { type: 'note', id: n.id }, 'jogk', ['transport']);
    expect(cands.map((c) => [c.type, c.title, c.stage])).toEqual([['transport', 'JOGK900710', 'rel']]);
    expect((await notes.linkCandidates(a, { type: 'note', id: n.id }, 'recibos', ['code'])).length).toBe(2);

    // sidebar counts
    const counts = await notes.contentCounts(a, new Set(['codelib', 'transports', 'systems']));
    expect(counts).toMatchObject({ codelib: 4, transports: 1, systems: 1 });

    // Trash: restore, then purge (links go too)
    await cl.trashObject(a, prog.id);
    expect((await notes.linksOf(a, { type: 'note', id: n.id })).length).toBe(0);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'code',
      'ZHR_PT_RECIBOS',
    ]);
    await notes.restoreTrash(a, [{ kind: 'code', id: prog.id }]);
    expect((await cl.listObjects(a)).map((o) => o.name)).toContain('ZHR_PT_RECIBOS');
    await cl.trashObject(a, prog.id);
    await notes.purgeTrash(a, [{ kind: 'code', id: prog.id }]);
    const [row] =
      await admin`select count(*)::int as n from item_links where a_id = ${prog.id} or b_id = ${prog.id}`;
    expect(row!.n).toBe(0);
    expect((await cl.listObjects(a)).map((o) => o.name).sort()).toEqual([
      'ALV rápido',
      'ALV rápido (2)',
      'ZHR_PT_RECIBOS_COPY',
    ]);
  });

  it('functional: records per page shared by the tenant, schema checks, conflict, Trash and counts', async () => {
    const a = await signedIn('fn-a@example.pt');
    const b = await signedIn('fn-b@example.pt');
    const [c] =
      await admin`insert into mg_clients (tenant_id, name) values (${a.tenant.id}, 'Banco SOL') returning id`;
    const t = await fn.createRecord(a, 'fn_test', {
      title: 'Venda nacional',
      f: { module: 'SD', client: c!.id },
    });
    expect(t).toMatchObject({ page: 'fn_test', st: 'todo', code: '', rows: [], f: { module: 'SD' } });
    const up = await fn.updateRecord(a, 'fn_test', t.id, {
      code: 'UAT-SD-014',
      st: 'run',
      f: { module: 'SD', kind: 'UAT', date: '2026-10-05' },
      rows: [{ step: 'Criar encomenda', expected: 'Desconto', st: 'pass' }, { step: 'Faturar' }],
      base: t.updatedAt,
    });
    expect(up.rows).toHaveLength(2);
    // schema of the page
    expect(await codeOf(fn.updateRecord(a, 'fn_test', t.id, { st: 'tobe' }))).toBe('invalid_input');
    expect(await codeOf(fn.updateRecord(a, 'fn_test', t.id, { f: { golive: '2026-01-01' } }))).toBe(
      'invalid_input',
    );
    expect(await codeOf(fn.updateRecord(a, 'fn_test', t.id, { rows: [{ st: 'skip' }] }))).toBe(
      'invalid_input',
    );
    expect(
      await codeOf(
        fn.updateRecord(a, 'fn_test', t.id, { f: { client: '01900000-0000-7000-8000-000000000000' } }),
      ),
    ).toBe('client_not_found');
    // stale edit → conflict; another page's id → 404
    expect(await codeOf(fn.updateRecord(a, 'fn_test', t.id, { title: 'x', base: t.updatedAt }))).toBe(
      'conflict',
    );
    expect(await codeOf(fn.updateRecord(a, 'fn_cut', t.id, { title: 'x' }))).toBe('not_found');
    // tenant isolation
    expect(await fn.listRecords(b, 'fn_test')).toEqual([]);
    expect(await codeOf(fn.updateRecord(b, 'fn_test', t.id, { title: 'x' }))).toBe('not_found');
    expect(await codeOf(fn.createRecord(b, 'fn_test', { title: 'x', f: { client: c!.id } }))).toBe(
      'client_not_found',
    );

    await fn.createRecord(a, 'fn_cut', { title: 'Go-live' });
    expect(await notes.contentCounts(a, new Set(['fn_test', 'fn_cut', 'fn_mig']))).toMatchObject({
      fn_test: 1,
      fn_cut: 1,
    });
    await fn.trashRecord(a, 'fn_test', t.id);
    expect((await notes.listTrash(a)).map((x) => [x.kind, x.title])).toContainEqual([
      'fn',
      'UAT-SD-014 · Venda nacional',
    ]);
    await notes.restoreTrash(a, [{ kind: 'fn', id: t.id }]);
    expect((await fn.listRecords(a, 'fn_test')).map((r) => r.code)).toEqual(['UAT-SD-014']);
    await fn.trashRecord(a, 'fn_test', t.id);
    await notes.purgeTrash(a, 'all');
    expect(await fn.listRecords(a, 'fn_test')).toEqual([]);
  });

  it('SAP News saved for later: private, sanitised again on the server, counted', async () => {
    const { saveItem, listSaved, unsaveItem } = await import('@/server/news/saved');
    const a = await signedIn('nw-a@example.pt');
    const b = await signedIn('nw-b@example.pt');
    const item = {
      title: 'Novidades do SAP S/4HANA Cloud',
      link: 'https://news.sap.com/2026/10/s4/',
      src: 'sapnews',
      date: '2026-10-06T09:30:00.000Z',
      author: 'SAP',
      img: '',
      excerpt: 'Resumo',
      html: '<p onclick="x()">Texto</p><script>alert(1)</script><img src="javascript:alert(1)">',
    };
    await saveItem(a, item);
    await saveItem(a, item); // same link once
    const list = await listSaved(a);
    expect(list).toHaveLength(1);
    expect(list[0]!.html).toBe('<p>Texto</p>');
    expect(await listSaved(b)).toEqual([]);
    expect((await notes.contentCounts(a, new Set(['news']))).newsSaved).toBe(1);
    await unsaveItem(b, item.link); // someone else's: nothing happens
    expect(await listSaved(a)).toHaveLength(1);
    await unsaveItem(a, item.link);
    expect(await listSaved(a)).toEqual([]);
  });

  it('management: sample data, batches of changes, references checked inside the tenant', async () => {
    const mg = await import('@/server/content/mg');
    const { mgDiff } = await import('@/lib/mg');
    const a = await signedIn('mg-a@example.pt');
    const b = await signedIn('mg-b@example.pt');
    await mg.resetMgSample(a);
    const d = await mg.loadMg(a);
    expect([d.clients.length, d.teams.length, d.people.length, d.projects.length, d.reqs.length]).toEqual([
      6, 3, 38, 9, 6,
    ]);
    expect(d.allocs.length).toBeGreaterThan(20);
    expect(d.ts.length).toBeGreaterThan(20);
    expect(d.teams.every((t) => d.people.some((p) => p.id === t.lead))).toBe(true);
    expect(await mg.loadMg(b)).toMatchObject({ people: [], clients: [], settings: {} });

    // a change made on a copy becomes ops (puts, then deletes)
    const next = structuredClone(d);
    const p0 = next.people[0]!;
    p0.name = 'Rui M.';
    p0.skills = { ...p0.skills, rap: 2 };
    next.allocs = next.allocs.filter((x) => x.person !== p0.id);
    next.settings = { levels: ['', 'Júnior', 'Pleno', 'Sénior', 'Expert', 'Principal'] };
    const ops = mgDiff(d, next);
    expect(ops.filter((o) => o.op === 'put').map((o) => o.c)).toEqual(['people', 'settings']);
    await mg.applyMgOps(a, ops);
    const d2 = await mg.loadMg(a);
    expect(d2.people.find((x) => x.id === p0.id)).toMatchObject({ name: 'Rui M.', skills: { rap: 2 } });
    expect(d2.allocs.some((x) => x.person === p0.id)).toBe(false);
    expect(d2.settings.levels).toHaveLength(6);

    // invalid data and references to another tenant's rows are refused, nothing is applied
    expect(await codeOf(mg.applyMgOps(a, [{ op: 'put', c: 'people', v: { ...p0, level: 0 } }]))).toBe(
      'invalid_input',
    );
    await mg.resetMgSample(b);
    const other = (await mg.loadMg(b)).projects[0]!;
    const sneaky = {
      id: crypto.randomUUID(),
      person: p0.id,
      project: other.id,
      from: '2026-10-05',
      to: '2026-11-02',
      hours: 8,
    };
    expect(await codeOf(mg.applyMgOps(a, [{ op: 'put', c: 'allocs', v: sneaky }]))).toBe('invalid_reference');
    expect(
      await codeOf(
        mg.applyMgOps(a, [
          { op: 'put', c: 'teams', v: { ...d.teams[0]!, lead: (await mg.loadMg(b)).people[0]!.id } },
        ]),
      ),
    ).toBe('invalid_reference');
    // another tenant's row can't be deleted
    await mg.applyMgOps(a, [{ op: 'del', c: 'projects', id: other.id }]);
    expect((await mg.loadMg(b)).projects.some((x) => x.id === other.id)).toBe(true);
    // deleting a project removes its allocations (FK)
    const pj = d2.projects[0]!;
    await mg.applyMgOps(a, [{ op: 'del', c: 'projects', id: pj.id }]);
    expect((await mg.loadMg(a)).allocs.some((x) => x.project === pj.id)).toBe(false);
  });

  it('management projects in tasks, issues and transports: own tenant only, cleared when deleted', async () => {
    const mg = await import('@/server/content/mg');
    const { createTask, updateTask } = await import('@/server/content/tasks');
    const { createIssue, updateIssue } = await import('@/server/content/issues');
    const { createTransport, updateTransport } = await import('@/server/content/transports');
    const a = await signedIn('mgl-a@example.pt');
    const b = await signedIn('mgl-b@example.pt');
    await mg.resetMgSample(a);
    await mg.resetMgSample(b);
    const opts = await mg.mgOptions(a);
    expect(opts.projects).toHaveLength(9);
    expect(opts.people).toHaveLength(38);
    const pj = opts.projects.find((p) => p.client)!;
    const foreign = (await mg.mgOptions(b)).projects[0]!.id;

    const task = await createTask(a, { title: 'Ligada a projeto' });
    expect((await updateTask(a, task.id, { projectId: pj.id })).task.projectId).toBe(pj.id);
    expect(await codeOf(updateTask(a, task.id, { projectId: foreign }))).toBe('invalid_reference');
    const issue = await createIssue(a, { title: 'Problema' });
    expect((await updateIssue(a, issue.id, { projectId: pj.id })).projectId).toBe(pj.id);
    expect(await codeOf(updateIssue(a, issue.id, { projectId: foreign }))).toBe('invalid_reference');
    const tr = await createTransport(a, { projectId: pj.id, description: 'Ordem' });
    expect(tr.projectId).toBe(pj.id);
    expect(await codeOf(updateTransport(a, tr.id, { projectId: foreign }))).toBe('invalid_reference');
    expect(await codeOf(createTransport(a, { projectId: foreign }))).toBe('invalid_reference');

    // deleting the project in Management clears the links
    await mg.applyMgOps(a, [{ op: 'del', c: 'projects', id: pj.id }]);
    const { listTasks } = await import('@/server/content/tasks');
    const { listIssues } = await import('@/server/content/issues');
    const { listTransports } = await import('@/server/content/transports');
    expect((await listTasks(a)).find((x) => x.id === task.id)?.projectId).toBeNull();
    expect((await listIssues(a)).find((x) => x.id === issue.id)?.projectId).toBeNull();
    expect((await listTransports(a)).find((x) => x.id === tr.id)?.projectId).toBeNull();
  });
});
