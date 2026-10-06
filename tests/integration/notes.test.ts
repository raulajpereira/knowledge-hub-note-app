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
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE item_links, note_attachments, notes, folders, user_assets, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
});
