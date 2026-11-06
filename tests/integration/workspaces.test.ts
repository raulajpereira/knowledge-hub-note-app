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
      'TRUNCATE workspaces, task_subtasks, tasks, note_attachments, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
});
