import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// API Playground folder tree (0040): reorder, nest, take out, no cycles, no
// foreign parents, and removing a folder moves its contents up. Every query
// runs as kh_app under RLS.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

describe.skipIf(!enabled)('api playground folders', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let apip: typeof import('@/server/content/apiPlayground');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, apip, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/apiPlayground'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE api_envs, api_requests, folders, user_assets, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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
  /** The tree as "parent/name" in sibling order, depth first. */
  const tree = (list: Array<{ id: string; name: string; parentId: string | null; sort: number }>) => {
    const out: string[] = [];
    const walk = (parent: string | null, pre: string) =>
      list
        .filter((f) => f.parentId === parent)
        .sort((a, b) => a.sort - b.sort)
        .forEach((f) => {
          out.push(pre + f.name);
          walk(f.id, `${pre}${f.name}/`);
        });
    walk(null, '');
    return out;
  };

  it('reorders, nests and un-nests folders; no cycles, no foreign parents', async () => {
    const a = await signedIn('tree-a@example.pt');
    const b = await signedIn('tree-b@example.pt');
    const sf = await apip.createApiFolder(a, 'SuccessFactors');
    const sol = await apip.createApiFolder(a, 'Banco SOL');
    const ec = await apip.createApiFolder(a, 'Employee Central');
    expect(tree(await apip.listApiFolders(a))).toEqual(['SuccessFactors', 'Banco SOL', 'Employee Central']);

    // reorder at the top level
    expect(tree(await apip.moveApiFolder(a, ec.id, { parentId: null, position: 0 }))).toEqual([
      'Employee Central',
      'SuccessFactors',
      'Banco SOL',
    ]);
    // nest, then a sub-subfolder, and a new folder made straight inside one
    await apip.moveApiFolder(a, ec.id, { parentId: sf.id, position: 0 });
    const tm = await apip.createApiFolder(a, 'Time', sf.id);
    expect(tm.parentId).toBe(sf.id);
    let all = await apip.moveApiFolder(a, tm.id, { parentId: ec.id, position: 99 });
    expect(tree(all)).toEqual([
      'SuccessFactors',
      'SuccessFactors/Employee Central',
      'SuccessFactors/Employee Central/Time',
      'Banco SOL',
    ]);
    expect(all.filter((f) => f.parentId === null).map((f) => [f.name, f.sort])).toEqual([
      ['SuccessFactors', 0],
      ['Banco SOL', 1],
    ]);

    // a folder can't go into itself or one of its descendants
    expect(await codeOf(apip.moveApiFolder(a, sf.id, { parentId: sf.id, position: 0 }))).toBe('folder_cycle');
    expect(await codeOf(apip.moveApiFolder(a, sf.id, { parentId: tm.id, position: 0 }))).toBe('folder_cycle');
    // the trigger refuses it too, whoever writes it
    const code = await admin`update folders set parent_id = ${tm.id} where id = ${sf.id}`.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
    expect(code).toBe('KHF01');

    // someone else's folders: neither as parent nor to move
    const other = await apip.createApiFolder(b, 'Do Rui');
    expect(await codeOf(apip.moveApiFolder(a, sol.id, { parentId: other.id, position: 0 }))).toBe(
      'folder_not_found',
    );
    expect(await codeOf(apip.moveApiFolder(b, sol.id, { parentId: null, position: 0 }))).toBe('not_found');
    expect(await codeOf(apip.moveApiFolder(b, other.id, { parentId: sf.id, position: 0 }))).toBe(
      'folder_not_found',
    );
    expect(await codeOf(apip.createApiFolder(b, 'X', sf.id))).toBe('folder_not_found');
    // only API folders nest (the trigger)
    const [n] = await admin`select tenant_id, owner_id from folders where id = ${sf.id}`;
    const c2 = await admin`insert into folders (tenant_id, owner_id, kind, name, color, parent_id)
      values (${n!.tenant_id}, ${n!.owner_id}, 'notes', 'n', '', ${sf.id})`.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
    expect(c2).toBe('KHF02');

    // back out to the top level, between the others
    all = await apip.moveApiFolder(a, tm.id, { parentId: null, position: 1 });
    expect(tree(all)).toEqual(['SuccessFactors', 'SuccessFactors/Employee Central', 'Time', 'Banco SOL']);
    expect(tree(await apip.listApiFolders(b))).toEqual(['Do Rui']);
  });

  it('removing a folder moves its subfolders and requests up to its parent', async () => {
    const a = await signedIn('tree-del@example.pt');
    const sf = await apip.createApiFolder(a, 'SuccessFactors');
    const ec = await apip.createApiFolder(a, 'Employee Central', sf.id);
    const tm = await apip.createApiFolder(a, 'Time', ec.id);
    const pay = await apip.createApiFolder(a, 'Payroll', ec.id);
    await apip.createApiFolder(a, 'Onboarding', sf.id);
    const rEc = await apip.createApiRequest(a, { title: 'Ler EC', folderId: ec.id });
    const rTm = await apip.createApiRequest(a, { title: 'Ler Time', folderId: tm.id });
    const rSf = await apip.createApiRequest(a, { title: 'Ler SF', folderId: sf.id });
    // requests go into subfolders like into any folder
    expect(rTm.folderId).toBe(tm.id);

    await apip.deleteApiFolder(a, ec.id);
    const all = await apip.listApiFolders(a);
    // Time and Payroll take Employee Central's place, before Onboarding
    expect(tree(all)).toEqual([
      'SuccessFactors',
      'SuccessFactors/Time',
      'SuccessFactors/Payroll',
      'SuccessFactors/Onboarding',
    ]);
    expect(all.find((f) => f.id === pay.id)!.parentId).toBe(sf.id);
    const reqs = await apip.listApiRequests(a);
    expect(reqs.find((r) => r.id === rEc.id)!.folderId).toBe(sf.id);
    expect(reqs.find((r) => r.id === rTm.id)!.folderId).toBe(tm.id);

    // a top-level folder: subfolders to the top level, requests to "Sem Pasta"
    await apip.deleteApiFolder(a, sf.id);
    expect(tree(await apip.listApiFolders(a))).toEqual(['Time', 'Payroll', 'Onboarding']);
    const after = await apip.listApiRequests(a);
    expect(after.find((r) => r.id === rSf.id)!.folderId).toBeNull();
    expect(after.find((r) => r.id === rEc.id)!.folderId).toBeNull();
    // the subfolders keep their own environments
    const envs = await apip.listApiEnvs(a);
    expect(envs.filter((e) => e.folderId === tm.id).map((e) => e.name)).toEqual(['DEV', 'QAS', 'PRD']);
    expect(envs.some((e) => e.folderId === sf.id || e.folderId === ec.id)).toBe(false);
  });
});
