import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Ambientes, fase 1 (migração 0052): every person has a workspace ("Meu
// Ambiente"), every new item lands in one of its owner's workspaces, nobody
// can put an item in someone else's, the last workspace cannot be deleted,
// and deleting the person still works. Through the real services as kh_app.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.29', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('workspaces (Ambientes) — foundation', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notesSvc: typeof import('@/server/content/notes');
  let tasksSvc: typeof import('@/server/content/tasks');
  let tenant: typeof import('@/server/content/tenant');
  let wsSvc: typeof import('@/server/workspaces');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notesSvc, tasksSvc, tenant, dbm, wsSvc] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/tasks'),
      import('@/server/content/tenant'),
      import('@/db/client'),
      import('@/server/workspaces'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE item_links, workspaces, task_subtasks, tasks, note_attachments, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
  const wsOf = (userId: string) =>
    admin<
      { id: string; name: string }[]
    >`select id, name from workspaces where owner_id = ${userId} order by sort, created_at`;

  it('a new person gets "Meu Ambiente" and new items land in it', async () => {
    const ana = await signedIn('ana@ws.pt');
    const ws = await wsOf(ana.user.id);
    expect(ws.map((w) => w.name)).toEqual(['Meu Ambiente']);
    const note = await notesSvc.createNote(ana, { title: 'Plano' });
    const task = await tasksSvc.createTask(ana, { title: 'Rever' });
    const [n] = await admin`select workspace_id from notes where id = ${note.id}`;
    const [t] = await admin`select workspace_id from tasks where id = ${task.id}`;
    expect(n!.workspace_id).toBe(ws[0]!.id);
    expect(t!.workspace_id).toBe(ws[0]!.id);
  });

  it('each person sees only their own workspaces; items never go to someone else’s', async () => {
    const ana = await signedIn('ana2@ws.pt');
    const rui = await signedIn('rui2@ws.pt');
    const [ruiWs] = await wsOf(rui.user.id);
    const mine = await tenant.asUser(ana, (tx) => tx.execute(`select id from workspaces`));
    expect([...(mine as unknown as Array<{ id: string }>)]).toHaveLength(1);
    const note = await notesSvc.createNote(ana, { title: 'Da Ana' });
    await expect(admin`update notes set workspace_id = ${ruiWs!.id} where id = ${note.id}`).rejects.toThrow(
      /workspace of another person/,
    );
  });

  it('the last workspace cannot be deleted, a second one can, and a non-empty one cannot', async () => {
    const ana = await signedIn('ana3@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    await expect(admin`delete from workspaces where id = ${w1!.id}`).rejects.toThrow(/last workspace/);
    const [w2] = await admin<{ id: string }[]>`
      insert into workspaces (tenant_id, owner_id, name) values (${ana.tenant.id}, ${ana.user.id}, 'Formação') returning id`;
    // an item moved there keeps the workspace from being deleted (and the item from going with it)
    const note = await notesSvc.createNote(ana, { title: 'Curso' });
    await admin`update notes set workspace_id = ${w2!.id} where id = ${note.id}`;
    await expect(admin`delete from workspaces where id = ${w2!.id}`).rejects.toThrow(/foreign key/);
    await admin`update notes set workspace_id = ${w1!.id} where id = ${note.id}`;
    await admin`delete from workspaces where id = ${w2!.id}`;
    expect(await wsOf(ana.user.id)).toHaveLength(1);
    const [n] = await admin`select count(*)::int as n from notes where id = ${note.id}`;
    expect(n!.n).toBe(1);
  });

  it('deleting a person (and their items) still works', async () => {
    const ana = await signedIn('ana4@ws.pt');
    await notesSvc.createNote(ana, { title: 'x' });
    await admin`delete from users where id = ${ana.user.id}`;
    expect(await wsOf(ana.user.id)).toHaveLength(0);
  });

  it('the look is kept per workspace, the rest of the prefs per person; new items go to the active one', async () => {
    const ana = await signedIn('ana5@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const [w2] = await admin<{ id: string }[]>`
      insert into workspaces (tenant_id, owner_id, name) values (${ana.tenant.id}, ${ana.user.id}, 'Pessoal') returning id`;
    const mods = new Set(['typeface']);
    // in "Meu Ambiente": a dark Noite and the typeface
    await wsSvc.patchPrefsFor(
      { ...ana, workspaceId: w1!.id },
      { bg: { mode: 'Noite', blur: 0, dim: 15 }, font: 'Manrope' },
      mods,
    );
    // in "Pessoal": Areia — the typeface is the same everywhere
    await wsSvc.patchPrefsFor(
      { ...ana, workspaceId: w2!.id },
      { bg: { mode: 'Areia', blur: 0, dim: 15 } },
      mods,
    );
    const p1 = (await wsSvc.prefsFor({ ...ana, workspaceId: w1!.id })).prefs;
    const p2 = (await wsSvc.prefsFor({ ...ana, workspaceId: w2!.id })).prefs;
    expect(p1.bg?.mode).toBe('Noite');
    expect(p2.bg?.mode).toBe('Areia');
    expect(p1.font).toBe('Manrope');
    expect(p2.font).toBe('Manrope');
    // the Home cards and their shortcuts are per workspace too
    await wsSvc.patchPrefsFor(
      { ...ana, workspaceId: w2!.id },
      {
        home: {
          widgets: [{ id: 'w1', type: 'shortcuts', size: 'M' }],
          shortcuts: [{ id: 'g', title: 'Ginásio', url: 'https://gym.example.com' }],
        },
      },
      mods,
    );
    const h1 = (await wsSvc.prefsFor({ ...ana, workspaceId: w1!.id })).prefs.home;
    const h2 = (await wsSvc.prefsFor({ ...ana, workspaceId: w2!.id })).prefs.home;
    expect(h2?.shortcuts?.map((x) => x.title)).toEqual(['Ginásio']);
    expect(h1).toBeUndefined();
    // nothing written to user_prefs for the look keys
    const [g] = await admin`select data from user_prefs where user_id = ${ana.user.id}`;
    expect((g!.data as Record<string, unknown>).bg).toBeUndefined();
    // a new note made while "Pessoal" is active goes there
    const note = await notesSvc.createNote({ ...ana, workspaceId: w2!.id }, { title: 'Ginásio' });
    const [n] = await admin`select workspace_id from notes where id = ${note.id}`;
    expect(n!.workspace_id).toBe(w2!.id);
    // someone else's workspace id is ignored (the note goes to the person's first one)
    const rui = await signedIn('rui5@ws.pt');
    const note2 = await notesSvc.createNote(
      { ...ana, workspaceId: (await wsOf(rui.user.id))[0]!.id },
      { title: 'x' },
    );
    const [n2] = await admin`select workspace_id from notes where id = ${note2.id}`;
    expect(n2!.workspace_id).toBe(w1!.id);
    // rename / colour / icon, validated
    const w = await wsSvc.updateWorkspace(ana, w2!.id, {
      name: '  Casa  ',
      color: 'oklch(0.8 0.15 150)',
      icon: '🏡',
    });
    expect(w).toMatchObject({ name: 'Casa', icon: '🏡' });
    await expect(wsSvc.updateWorkspace(ana, w2!.id, { color: 'red' })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(wsSvc.updateWorkspace(rui, w2!.id, { name: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
  // ── fase 2b ────────────────────────────────────────────────────────────
  const inWs = (a: Awaited<ReturnType<typeof signedIn>>, workspaceId: string) => ({
    ...a,
    workspaceId,
    wsScope: true,
  });

  it('2b: the app sees only the active workspace; background work and plan limits see everything', async () => {
    const ana = await signedIn('ana6@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const w2 = await wsSvc.createWorkspace(inWs(ana, w1!.id), { name: 'Pessoal', icon: '🏡' });
    const a1 = inWs(ana, w1!.id);
    const a2 = inWs(ana, w2.id);
    await notesSvc.createNote(a1, { title: 'Trabalho' });
    await notesSvc.createNote(a2, { title: 'Ginásio' });
    await tasksSvc.createTask(a2, { title: 'Comprar fruta' });
    const titles = async (a: typeof a1) => (await notesSvc.listNotes(a, {})).map((n) => n.title).sort();
    expect(await titles(a1)).toEqual(['Trabalho']);
    expect(await titles(a2)).toEqual(['Ginásio']);
    expect((await tasksSvc.listTasks(a1)).map((t) => t.title)).toEqual([]);
    expect((await tasksSvc.listTasks(a2)).map((t) => t.title)).toEqual(['Comprar fruta']);
    // a note of the other workspace can't be read or changed from here
    const other = (await notesSvc.listNotes(a2, {}))[0]!;
    await expect(notesSvc.updateNote(a1, other.id, { title: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    });
    // background work (no wsScope) sees both
    expect(await titles(ana as typeof a1)).toEqual(['Ginásio', 'Trabalho']);
    // the plan limit counts every workspace: with max 2 notes, the third fails in either
    const [plan] = await admin`select id from plans where code = 'PRO'`;
    await admin`insert into plan_limits (plan_id, resource, max) values (${plan!.id}, 'notes', 2)
                on conflict (plan_id, resource) do update set max = 2`;
    const { invalidateEntitlements } = await import('@/server/licensing/entitlements');
    await invalidateEntitlements(ana.tenant.id);
    await expect(notesSvc.createNote(a1, { title: 'x' })).rejects.toMatchObject({ code: 'limit_reached' });
    // modules: outside the first workspace only the separated ones (and the features)
    const ent = ['notes', 'tasks', 'calendar', 'emails', 'mg_people', 'tickets', 'ai', 'sidebar'];
    expect(await wsSvc.modulesFor(a1, ent)).toEqual(ent);
    expect(await wsSvc.modulesFor(a2, ent)).toEqual([
      'notes',
      'tasks',
      'calendar',
      'emails',
      'ai',
      'sidebar',
    ]);
    await wsSvc.updateWorkspace(a2, w2.id, { modules: ['notes'] });
    expect(await wsSvc.modulesFor(a2, ent)).toEqual(['notes', 'ai', 'sidebar']);
  });

  it('2b: creating within the plan; deleting only an empty workspace, never the last', async () => {
    const ana = await signedIn('ana7@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const [plan] = await admin`select id from plans where code = 'PRO'`;
    await admin`insert into plan_limits (plan_id, resource, max) values (${plan!.id}, 'workspaces', 2)
                on conflict (plan_id, resource) do update set max = 2`;
    const { invalidateEntitlements } = await import('@/server/licensing/entitlements');
    await invalidateEntitlements(ana.tenant.id);
    const a1 = inWs(ana, w1!.id);
    const w2 = await wsSvc.createWorkspace(a1, { name: 'Formação' });
    expect(w2.modules).toEqual([...(await import('@/lib/workspaces')).WS_SEPARATED]);
    await expect(wsSvc.createWorkspace(a1, { name: 'Terceiro' })).rejects.toMatchObject({
      code: 'limit_reached',
    });
    await expect(wsSvc.createWorkspace(a1, { name: '  ' })).rejects.toMatchObject({ code: 'validation' });
    // a note in the Trash still keeps it from being deleted
    const n = await notesSvc.createNote(inWs(ana, w2.id), { title: 'Curso' });
    await admin`update notes set deleted_at = now() where id = ${n.id}`;
    await expect(wsSvc.deleteWorkspace(a1, w2.id)).rejects.toMatchObject({
      code: 'workspace_not_empty',
      extra: { items: { notes: 1 } },
    });
    await admin`update notes set workspace_id = ${w1!.id} where id = ${n.id}`;
    await wsSvc.deleteWorkspace(a1, w2.id);
    await expect(wsSvc.deleteWorkspace(a1, w1!.id)).rejects.toMatchObject({ code: 'last_workspace' });
    const [c] = await admin`select count(*)::int as n from notes where id = ${n.id}`;
    expect(c!.n).toBe(1);
  });

  it('2b: moving a folder takes its notes and subfolders; linked items only when asked', async () => {
    const ana = await signedIn('ana8@ws.pt');
    const rui = await signedIn('rui8@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const a1 = inWs(ana, w1!.id);
    const w2 = await wsSvc.createWorkspace(a1, { name: 'Pessoal' });
    const a2 = inWs(ana, w2.id);
    const f = await notesSvc.createFolder(a1, 'Casa');
    const inFolder = await notesSvc.createNote(a1, { title: 'Obras', folderId: f.id });
    const alone = await notesSvc.createNote(a1, { title: 'Solta', folderId: f.id });
    const task = await tasksSvc.createTask(a1, { title: 'Ligar ao canalizador' });
    await notesSvc.linkItems(a1, { type: 'note', id: inFolder.id }, { type: 'task', id: task.id });
    // preview: what goes, and the linked task that could go too
    const pv = await wsSvc.moveItems(a1, {
      items: [{ type: 'folder', id: f.id }],
      target: w2.id,
      preview: true,
    });
    expect(pv.moved).toMatchObject({ folder: 1, note: 2, task: 0 });
    expect(pv.linked).toEqual([{ type: 'task', id: task.id, title: 'Ligar ao canalizador' }]);
    expect((await notesSvc.listNotes(a1, {})).length).toBe(2); // nothing moved yet
    // move the single note first: it leaves its folder
    await wsSvc.moveItems(a1, { items: [{ type: 'note', id: alone.id }], target: w2.id });
    const [s] = await admin`select workspace_id, folder_id from notes where id = ${alone.id}`;
    expect(s).toMatchObject({ workspace_id: w2.id, folder_id: null });
    // then the folder, with the linked task
    await wsSvc.moveItems(a1, { items: [{ type: 'folder', id: f.id }], target: w2.id, withLinked: true });
    expect(await notesSvc.listNotes(a1, {})).toHaveLength(0);
    expect(await tasksSvc.listTasks(a1)).toHaveLength(0);
    expect((await notesSvc.listNotes(a2, {})).map((n) => n.title).sort()).toEqual(['Obras', 'Solta']);
    expect((await notesSvc.listFolders(a2)).folders.map((x) => x.name)).toContain('Casa');
    expect((await notesSvc.listFolders(a1)).folders).toHaveLength(0);
    const [o] = await admin`select folder_id from notes where id = ${inFolder.id}`;
    expect(o!.folder_id).toBe(f.id); // still in its folder
    // the link is kept
    const [l] = await admin`select count(*)::int as n from item_links`;
    expect(l!.n).toBe(1);
    // nobody moves someone else's items, or into someone else's workspace
    const [rw] = await wsOf(rui.user.id);
    await expect(
      wsSvc.moveItems(inWs(rui, rw!.id), { items: [{ type: 'task', id: task.id }], target: rw!.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      wsSvc.moveItems(a2, { items: [{ type: 'task', id: task.id }], target: rw!.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
    // items of another workspace than the active one can't be moved from here
    await expect(
      wsSvc.moveItems(a1, { items: [{ type: 'task', id: task.id }], target: w1!.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('Atividade: created, done and changed items of the period, of the active workspace only', async () => {
    const ana = await signedIn('ana9@ws.pt');
    const rui = await signedIn('rui9@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const a1 = inWs(ana, w1!.id);
    const w2 = await wsSvc.createWorkspace(a1, { name: 'Pessoal' });
    const a2 = inWs(ana, w2.id);
    const { activityOf } = await import('@/server/activity');
    const t = await tasksSvc.createTask(a1, { title: 'Fechar SM37' });
    await tasksSvc.updateTask(a1, t.id, { done: true });
    const n = await notesSvc.createNote(a1, { title: 'Ata' });
    // an edit long after the creation counts as "Atualizado"
    await admin`update notes set created_at = now() - interval '1 day', updated_at = now() where id = ${n.id}`;
    await notesSvc.createNote(a2, { title: 'Ginásio' });
    await tasksSvc.createTask(rui, { title: 'Do Rui' });
    const range = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 60_000) };
    const mods = new Set(['tasks', 'notes']);
    const got = (await activityOf(a1, range, mods)).map((x) => `${x.type}:${x.title}:${x.action}`).sort();
    expect(got).toEqual(['note:Ata:updated', 'task:Fechar SM37:created', 'task:Fechar SM37:done']);
    const g2 = await activityOf(a2, range, mods);
    expect(g2.map((x) => x.title)).toEqual(['Ginásio']);
    expect(g2[0]!.href).toMatch(/^\/app\/notes\?n=/);
    // a module the workspace doesn't show is left out; an earlier period is empty
    expect(await activityOf(a1, range, new Set(['notes']))).toHaveLength(1);
    expect(
      await activityOf(
        a1,
        { from: new Date(Date.now() - 5 * 864e5), to: new Date(Date.now() - 4 * 864e5) },
        mods,
      ),
    ).toHaveLength(0);
  });

  it('3a: Artefactos, Tarefas de Projeto, Snippets e Notícias guardadas são de cada ambiente; movem-se', async () => {
    const ana = await signedIn('ana10@ws.pt');
    const [w1] = await wsOf(ana.user.id);
    const a1 = inWs(ana, w1!.id);
    const w2 = await wsSvc.createWorkspace(a1, { name: 'Pessoal' });
    const a2 = inWs(ana, w2.id);
    const [art, iss, snip] = await Promise.all([
      import('@/server/content/artifacts'),
      import('@/server/content/issues'),
      import('@/server/content/snippets'),
    ]);
    const f = await art.createArtifactFolder(a1, 'Relatórios');
    const ar = await art.createArtifact(a1, { title: 'Dashboard', folderId: f.id });
    await iss.createIssue(a2, { title: 'Bug do ginásio' });
    await snip.createSnippet(a1, { title: 'SELECT', type: 'snippet', lang: 'sql' });
    expect((await art.listArtifacts(a1)).map((x) => x.title)).toEqual(['Dashboard']);
    expect(await art.listArtifacts(a2)).toHaveLength(0);
    expect((await iss.listIssues(a2)).map((x) => x.title)).toEqual(['Bug do ginásio']);
    expect(await iss.listIssues(a1)).toHaveLength(0);
    expect(await snip.listSnippets(a2)).toHaveLength(0);
    // the same article saved in both workspaces
    const { saveItem, listSaved } = await import('@/server/news/saved');
    const item = {
      title: 'S/4',
      link: 'https://news.example.com/a',
      src: 'sap',
      date: '',
      author: '',
      img: '',
      excerpt: '',
      html: '<p>x</p>',
    };
    await saveItem(a1, item);
    await saveItem(a2, item);
    await saveItem(a2, item); // twice in one workspace: still one
    expect(await listSaved(a1)).toHaveLength(1);
    expect(await listSaved(a2)).toHaveLength(1);
    // moving the artifact folder takes the artifact with it
    const r = await wsSvc.moveItems(a1, { items: [{ type: 'folder', id: f.id }], target: w2.id });
    expect(r.moved).toMatchObject({ folder: 1, artifact: 1 });
    expect((await art.listArtifacts(a2)).map((x) => x.id)).toEqual([ar.id]);
    expect(await art.listArtifacts(a1)).toHaveLength(0);
  });
});
