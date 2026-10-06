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
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, tasksSvc, voiceSvc, homeSvc, dbm, vault] = await Promise.all([
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
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE vault_items, vault_keys, item_links, voice_notes, task_subtasks, tasks, note_attachments, notes, folders, user_assets, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
});
