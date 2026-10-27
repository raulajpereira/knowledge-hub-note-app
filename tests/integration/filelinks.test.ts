import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AuthContext } from '@/server/auth/session';

// Files of Ficheiros in "Ligações" through the real services, as kh_app under
// RLS: linking/unlinking with notes, tasks and meetings, the candidates
// search, another user's file (also in a shared folder) refused, the Trash
// hiding the link until restored, and purging removing it.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('file links', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let tasks: typeof import('@/server/content/tasks');
  let meet: typeof import('@/server/content/meetings');
  let drive: typeof import('@/server/content/drive');
  let sh: typeof import('@/server/share/folders');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, tasks, meet, drive, sh, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/tasks'),
      import('@/server/content/meetings'),
      import('@/server/content/drive'),
      import('@/server/share/folders'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE share_members, share_people, shared_folders, drive_files, meetings, item_links, task_subtasks, tasks, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
  const send = async (auth: AuthContext, name: string, text: string, at: object = {}) => {
    const data = new TextEncoder().encode(text);
    const s = await drive.startUpload(auth, { name, size: data.length, mime: 'text/plain', ...at });
    await drive.uploadPart(auth, s.uploadId, 1, data);
    return drive.completeUpload(auth, s.uploadId);
  };

  it('links files with notes, tasks and meetings; candidates; Trash and purge', async () => {
    const a = await signedIn('fk-a@example.pt');
    const fo = await drive.createDriveFolder(a, 'Contratos');
    const f = await send(a, 'Caderno de encargos.pdf', 'pdf!', { folderId: fo.id });
    const g = await send(a, 'Notas soltas.txt', 'abc');
    const note = await notes.createNote(a, { title: 'Go-live' });
    const task = await tasks.createTask(a, { title: 'Rever contrato' });
    const m = await meet.createMeeting(a, { title: 'Steering', heldOn: '2026-10-20' });
    const F = { type: 'file', id: f.id };

    // candidates: the user's files by name, with folder and size
    const c = await notes.linkCandidates(a, { type: 'note', id: note.id }, 'encargos', ['file']);
    expect(c).toMatchObject([{ type: 'file', id: f.id, title: 'Caderno de encargos.pdf', sub: 'Contratos' }]);
    expect(c[0]!.size).toBe(4);
    // nothing typed: the recent files
    expect(
      (await notes.linkCandidates(a, { type: 'note', id: note.id }, '', ['file'])).map((x) => x.id).sort(),
    ).toEqual([f.id, g.id].sort());

    // link from each side; the same pair twice is a no-op
    await notes.linkItems(a, { type: 'note', id: note.id }, F);
    await notes.linkItems(a, F, { type: 'note', id: note.id });
    await notes.linkItems(a, { type: 'task', id: task.id }, F);
    await notes.linkItems(a, F, { type: 'meeting', id: m.id });
    expect(await notes.linksOf(a, { type: 'note', id: note.id })).toEqual([
      { type: 'file', id: f.id, title: 'Caderno de encargos.pdf', sub: 'Contratos', size: 4 },
    ]);
    expect((await notes.linksOf(a, F)).map((l) => [l.type, l.title]).sort()).toEqual([
      ['meeting', 'Steering'],
      ['note', 'Go-live'],
      ['task', 'Rever contrato'],
    ]);

    // unlink
    await notes.unlinkItems(a, F, { type: 'task', id: task.id });
    expect(await notes.linksOf(a, { type: 'task', id: task.id })).toEqual([]);

    // Trash: the file disappears from the links (and the candidates), comes back on restore
    await drive.trashDriveFile(a, f.id);
    expect(await notes.linksOf(a, { type: 'note', id: note.id })).toEqual([]);
    expect((await notes.linkCandidates(a, { type: 'note', id: note.id }, 'encargos', ['file'])).length).toBe(
      0,
    );
    expect(await codeOf(notes.linkItems(a, { type: 'task', id: task.id }, F))).toBe('not_found');
    await notes.restoreTrash(a, [{ kind: 'file', id: f.id }]);
    expect((await notes.linksOf(a, { type: 'note', id: note.id })).map((l) => l.id)).toEqual([f.id]);

    // purging the file removes its links
    await drive.trashDriveFile(a, f.id);
    await notes.purgeTrash(a, [{ kind: 'file', id: f.id }]);
    expect(
      Number(
        (await admin`select count(*) as n from item_links where a_type = 'file' or b_type = 'file'`)[0]!.n,
      ),
    ).toBe(0);
    // the other side's links are untouched
    await notes.linkItems(a, { type: 'note', id: note.id }, { type: 'file', id: g.id });
    await notes.purgeTrash(a, [{ kind: 'file', id: g.id }]); // not in the Trash: kept
    expect((await notes.linksOf(a, { type: 'note', id: note.id })).map((l) => l.id)).toEqual([g.id]);
  });

  it("another user's file can't be linked or offered, not even from a shared folder", async () => {
    const a = await signedIn('fk-a@example.pt');
    const b = await signedIn('fk-b@example.pt');
    const fb = await send(b, 'Orçamento.xlsx', 'xls');
    const note = await notes.createNote(a, { title: 'Plano' });
    const N = { type: 'note', id: note.id };
    expect(await codeOf(notes.linkItems(a, N, { type: 'file', id: fb.id }))).toBe('not_found');
    expect(await codeOf(notes.linkItems(a, { type: 'file', id: fb.id }, N))).toBe('not_found');
    expect(await notes.linkCandidates(a, N, 'Orçamento', ['file'])).toEqual([]);
    // b can't link a's note to their file either
    expect(await codeOf(notes.linkItems(b, N, { type: 'file', id: fb.id }))).toBe('not_found');

    // a shared folder of files: a can read b's file there, but links stay owner-only
    const sf = await sh.createSharedFolder(b, { kind: 'files', name: 'Projeto' });
    await sh.addMember(b, sf, 'fk-a@example.pt', { lang: 'pt' });
    const inv = (await sh.listInvites(a)).find((i) => i.folderId === sf)!;
    await sh.answerInvite(a, inv.id, true);
    await drive.updateDriveFile(b, fb.id, { sharedFolderId: sf });
    expect((await drive.listDrive(a, await sh.reachableFolder(a, sf))).files.map((x) => x.id)).toEqual([
      fb.id,
    ]);
    expect(await codeOf(notes.linkItems(a, N, { type: 'file', id: fb.id }))).toBe('not_found');
    expect(await notes.linkCandidates(a, N, '', ['file'])).toEqual([]);
    // a link row forged straight into the table never shows b's file to a
    await admin`insert into item_links (tenant_id, owner_id, a_type, a_id, b_type, b_id)
      values (${a.tenant.id}, ${a.user.id}, 'file', ${fb.id}, 'note', ${note.id})`;
    expect(await notes.linksOf(a, N)).toEqual([]);
  });
});
