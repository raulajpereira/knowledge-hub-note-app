import 'server-only';
import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { workspaces } from '@/db/schema';
import { MODULES } from '@/server/licensing/catalog';
import { assertWithinLimit, getEntitlements } from '@/server/licensing/entitlements';
import { MAX_PREFS_BYTES, mergePrefs, parsePrefsPatch, prefAllowed, type Prefs } from '@/lib/prefs';
import {
  WS_MOVABLE,
  WS_PREF_KEYS,
  WS_SEPARATED,
  wsColor,
  wsIcon,
  wsModules,
  type Workspace,
  type WsMovable,
} from '@/lib/workspaces';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { allWorkspaces, asUser, lockLimit, type Tx } from '@/server/content/tenant';
import { getPrefs, patchPrefs } from '@/server/prefs';

// Ambientes (docs/AMBIENTES.md). Each person has one or more workspaces; the
// active one is per device (cookie kh_ws, read in getAuth). The look of the
// app (background, theme, accent, sidebar, start page, Home widgets) is kept
// per workspace in workspaces.look, over the person's global prefs (so a
// workspace that never changed it looks like before); everything else in the
// prefs stays global (language, typeface, sizes…).

const row = (w: typeof workspaces.$inferSelect): Workspace => ({
  id: w.id,
  name: w.name,
  color: w.color,
  icon: w.icon,
  sort: w.sort,
  modules: w.modules ?? null,
});

/** The person's workspaces (in order) and the one active on this device. */
export async function workspacesOf(auth: AuthContext) {
  const rows = await asUser(auth, (tx) =>
    tx.select().from(workspaces).orderBy(asc(workspaces.sort), asc(workspaces.createdAt), asc(workspaces.id)),
  );
  const active = rows.find((w) => w.id === auth.workspaceId) ?? rows[0];
  if (!active) throw new ApiError(409, 'no_workspace');
  return { list: rows.map(row), active: row(active), look: (active.look ?? {}) as Prefs };
}

/** Prefs as the app uses them: the global ones with the active workspace's look on top. */
export async function prefsFor(
  auth: AuthContext,
): Promise<{ prefs: Prefs; ws: Awaited<ReturnType<typeof workspacesOf>> }> {
  const [global, ws] = await Promise.all([getPrefs(auth.user.id), workspacesOf(auth)]);
  const prefs: Record<string, unknown> = { ...global };
  for (const k of WS_PREF_KEYS) if (ws.look[k] !== undefined) prefs[k] = ws.look[k];
  return { prefs: prefs as Prefs, ws };
}

/** Merge-patch of the prefs: the look keys go to the active workspace, the rest to the person. */
export async function patchPrefsFor(auth: AuthContext, input: unknown, modules: ReadonlySet<string>) {
  let patch: Record<string, unknown>;
  try {
    patch = parsePrefsPatch(input);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('pref_')) throw new ApiError(400, e.message);
    throw e;
  }
  const wsPart: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && !prefAllowed(k, v, modules))
      throw new ApiError(403, 'module_not_included', undefined, { key: k });
    if ((WS_PREF_KEYS as readonly string[]).includes(k)) wsPart[k] = v;
    else rest[k] = v;
  }
  if (Object.keys(rest).length) await patchPrefs(auth.user.id, rest, modules);
  if (Object.keys(wsPart).length) {
    const { active } = await workspacesOf(auth);
    await asUser(auth, async (tx) => {
      const [w] = await tx
        .select({ look: workspaces.look })
        .from(workspaces)
        .where(eq(workspaces.id, active.id))
        .for('update');
      const next = mergePrefs((w?.look ?? {}) as Prefs, wsPart);
      if (JSON.stringify(next).length > MAX_PREFS_BYTES) throw new ApiError(400, 'pref_too_large');
      await tx
        .update(workspaces)
        .set({ look: next, updatedAt: sql`now()` })
        .where(eq(workspaces.id, active.id));
    });
  }
  return (await prefsFor(auth)).prefs;
}

/** Name, colour, icon and modules of one of the person's workspaces. */
export async function updateWorkspace(
  auth: AuthContext,
  id: string,
  patch: { name?: string; color?: string; icon?: string; modules?: string[] | null },
): Promise<Workspace> {
  const set = { ...cleanLook(patch), updatedAt: new Date() };
  const [w] = await asUser(auth, (tx) =>
    tx.update(workspaces).set(set).where(eq(workspaces.id, id)).returning(),
  );
  if (!w) throw new ApiError(404, 'not_found');
  return row(w);
}

/** Checks that `id` is one of the person's workspaces (before it becomes the active one). */
export async function assertOwnWorkspace(auth: AuthContext, id: string) {
  const [w] = await asUser(auth, (tx) =>
    tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, id)).limit(1),
  );
  if (!w) throw new ApiError(404, 'not_found');
}

/** The modules of the plan the active workspace shows (wsModules). */
export async function modulesFor(auth: AuthContext, entitled: readonly string[]) {
  const { list, active } = await workspacesOf(auth);
  return wsModules(entitled, active, active.id === list[0]?.id);
}

function cleanLook(input: { name?: string; color?: string; icon?: string; modules?: string[] | null }) {
  const set: Partial<typeof workspaces.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 60) throw new ApiError(400, 'validation', 'name');
    set.name = name;
  }
  if (input.color !== undefined) {
    if (!wsColor(input.color)) throw new ApiError(400, 'validation', 'color');
    set.color = input.color;
  }
  if (input.icon !== undefined) {
    if (!wsIcon(input.icon)) throw new ApiError(400, 'validation', 'icon');
    set.icon = input.icon;
  }
  if (input.modules !== undefined) {
    const known = new Set(MODULES.map((m) => m.id));
    if (input.modules && (input.modules.length > 100 || input.modules.some((m) => !known.has(m))))
      throw new ApiError(400, 'validation', 'modules');
    set.modules = input.modules ? [...new Set(input.modules)] : null;
  }
  return set;
}

/** A new workspace (within the plan's "Ambientes por pessoa"); by default with the separated modules. */
export async function createWorkspace(
  auth: AuthContext,
  input: { name: string; color?: string; icon?: string; modules?: string[] | null },
): Promise<Workspace> {
  const set = cleanLook({ modules: [...WS_SEPARATED], ...input });
  if (!set.name) throw new ApiError(400, 'validation', 'name');
  return asUser(auth, async (tx) => {
    await lockLimit(tx, auth.tenant.id, `workspaces:${auth.user.id}`);
    const [{ n, s }] = (await tx
      .select({ n: sql<number>`count(*)::int`, s: sql<number>`coalesce(max(${workspaces.sort}), 0)::int` })
      .from(workspaces)) as [{ n: number; s: number }];
    await assertWithinLimit(auth.tenant.id, 'workspaces', n);
    const [w] = await tx
      .insert(workspaces)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        name: set.name!,
        color: set.color ?? '',
        icon: set.icon ?? '',
        modules: set.modules ?? null,
        sort: s + 1,
      })
      .returning();
    return row(w!);
  });
}

/** Every table whose items belong to a workspace (migration 0052). */
const WS_TABLES = [
  'folders',
  'notes',
  'tasks',
  'voice_notes',
  'meetings',
  'drive_files',
  'emails',
  'issues',
  'artifacts',
  'snippets',
  'api_requests',
  'api_envs',
  'whiteboards',
  'news_saved',
  'saved_views',
  'user_templates',
  'ai_chats',
  'vault_items',
  'tickets',
  'ticket_types',
  'mg_teams',
  'mg_people',
  'mg_projects',
  'mg_allocs',
  'mg_bookings',
  'mg_absences',
  'mg_timesheets',
  'mg_requests',
  // fase 3b: rows of a private workspace (the team's have none)
  'sap_systems',
  'sap_tcodes',
  'sap_transports',
  'sap_objects',
  'sap_notes',
  'sap_fn_records',
  'mg_clients',
] as const;

/** How many items (the ones in the Trash included) are in a workspace, per table; only the non-empty ones. */
async function itemsIn(tx: Tx, id: string) {
  const parts = WS_TABLES.map(
    (t) =>
      sql`select ${t}::text as t, count(*)::int as n from ${sql.identifier(t)} where workspace_id = ${id}`,
  );
  const rows = (await allWorkspaces(tx, () =>
    tx.execute(sql.join(parts, sql` union all `)),
  )) as unknown as Array<{
    t: string;
    n: number;
  }>;
  return Object.fromEntries([...rows].filter((r) => r.n > 0).map((r) => [r.t, r.n]));
}

/**
 * Deletes one of the person's workspaces — only an empty one (nothing is ever
 * deleted with it: the items must be moved first) and never the last one.
 */
export async function deleteWorkspace(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    await lockLimit(tx, auth.tenant.id, `workspaces:${auth.user.id}`);
    const all = await tx.select({ id: workspaces.id }).from(workspaces).for('update');
    if (!all.some((w) => w.id === id)) throw new ApiError(404, 'not_found');
    if (all.length < 2) throw new ApiError(409, 'last_workspace');
    const items = await itemsIn(tx, id);
    if (Object.keys(items).length) throw new ApiError(409, 'workspace_not_empty', undefined, { items });
    await tx.delete(workspaces).where(eq(workspaces.id, id));
  });
}

/* ------------------------------------------------------------------ move */

type Ref = { type: WsMovable; id: string };
const TABLE: Record<Exclude<WsMovable, 'folder'>, string> = {
  note: 'notes',
  task: 'tasks',
  voice: 'voice_notes',
  meeting: 'meetings',
  file: 'drive_files',
  issue: 'issues',
  artifact: 'artifacts',
  email: 'emails',
  snippet: 'snippets',
  whiteboard: 'whiteboards',
};
const TITLE: Record<Exclude<WsMovable, 'folder'>, string> = {
  note: 'title',
  task: 'title',
  voice: 'title',
  meeting: 'title',
  file: 'name',
  issue: 'title',
  artifact: 'title',
  email: 'subject',
  snippet: 'title',
  whiteboard: 'name',
};
/** the items kept in folders (they leave theirs when moved alone) */
const IN_FOLDER = new Set<string>(['note', 'meeting', 'file', 'artifact', 'email']);
/** folder kinds that move, and the tables of what they hold */
const FOLDER_KINDS = ['notes', 'files', 'meetings', 'emails', 'artifacts', 'api'];
const uuids = (ids: string[]): SQL =>
  ids.length
    ? sql`ARRAY[${sql.join(
        ids.map((i) => sql`${i}`),
        sql`,`,
      )}]::uuid[]`
    : sql`ARRAY[]::uuid[]`;
const FOLDER_KINDS_SQL = sql`ARRAY[${sql.join(
  FOLDER_KINDS.map((k) => sql`${k}`),
  sql`,`,
)}]::text[]`;
const rowsOf = <T>(r: unknown) => [...(r as Iterable<T>)];

/**
 * What moving `refs` takes with it: folders with their subfolders and their
 * notes / files / meetings, and the items linked to them ("Ligações") that are
 * in this workspace and can move too. Only the person's own items of the
 * active workspace (RLS, migration 0053).
 */
async function plan(tx: Tx, refs: Ref[]) {
  const pick = (t: WsMovable) => refs.filter((r) => r.type === t).map((r) => r.id);
  // the folders and every folder below them
  const roots = pick('folder');
  const folderIds = roots.length
    ? rowsOf<{ id: string }>(
        await tx.execute(sql`
          with recursive f as (
            select id from folders
             where id = any(${uuids(roots)}) and owner_id = kh_user_id() and deleted_at is null
               and kind = any(${FOLDER_KINDS_SQL})
            union
            select c.id from folders c join f on c.parent_id = f.id where c.deleted_at is null
          ) select id from f`),
      ).map((r) => r.id)
    : [];
  if (roots.some((r) => !folderIds.includes(r))) throw new ApiError(404, 'not_found');
  const own = async (type: Exclude<WsMovable, 'folder'>, ids: string[]) => {
    if (!ids.length) return [] as string[];
    const r = rowsOf<{ id: string }>(
      await tx.execute(
        sql`select id from ${sql.identifier(TABLE[type])} where id = any(${uuids(ids)}) and owner_id = kh_user_id() and deleted_at is null`,
      ),
    );
    if (r.length !== new Set(ids).size) throw new ApiError(404, 'not_found');
    return r.map((x) => x.id);
  };
  const inFolders = async (table: string) =>
    folderIds.length
      ? rowsOf<{ id: string }>(
          await tx.execute(
            sql`select id from ${sql.identifier(table)} where folder_id = any(${uuids(folderIds)}) and owner_id = kh_user_id()`,
          ),
        ).map((r) => r.id)
      : [];
  const items: Record<Exclude<WsMovable, 'folder'>, Set<string>> = {
    note: new Set([...(await own('note', pick('note'))), ...(await inFolders('notes'))]),
    task: new Set(await own('task', pick('task'))),
    voice: new Set(await own('voice', pick('voice'))),
    meeting: new Set([...(await own('meeting', pick('meeting'))), ...(await inFolders('meetings'))]),
    file: new Set([...(await own('file', pick('file'))), ...(await inFolders('drive_files'))]),
    issue: new Set(await own('issue', pick('issue'))),
    artifact: new Set([...(await own('artifact', pick('artifact'))), ...(await inFolders('artifacts'))]),
    email: new Set([...(await own('email', pick('email'))), ...(await inFolders('emails'))]),
    snippet: new Set(await own('snippet', pick('snippet'))),
    whiteboard: new Set(await own('whiteboard', pick('whiteboard'))),
  };
  // API Playground: the requests and environments of the folders that move
  const api = {
    requests: await inFolders('api_requests'),
    envs: await inFolders('api_envs'),
  };
  // linked items (one step) that are here and can move
  const moving = Object.entries(items).flatMap(([type, ids]) => [...ids].map((id) => ({ type, id })));
  const linked: Array<{ type: Exclude<WsMovable, 'folder'>; id: string; title: string }> = [];
  if (moving.length) {
    const pairs = sql.join(
      moving.map((m) => sql`(${m.type}::text, ${m.id}::uuid)`),
      sql`,`,
    );
    const other = rowsOf<{ type: string; id: string }>(
      await tx.execute(sql`
        with m(type, id) as (values ${pairs})
        select l.b_type as type, l.b_id as id from item_links l join m on l.a_type = m.type and l.a_id = m.id
        union
        select l.a_type, l.a_id from item_links l join m on l.b_type = m.type and l.b_id = m.id`),
    );
    for (const o of other) {
      const type = o.type as Exclude<WsMovable, 'folder'>;
      if (!(type in TABLE) || items[type].has(o.id) || linked.some((x) => x.id === o.id)) continue;
      const [r] = rowsOf<{ title: string }>(
        await tx.execute(
          sql`select ${sql.identifier(TITLE[type])} as title from ${sql.identifier(TABLE[type])} where id = ${o.id} and owner_id = kh_user_id() and deleted_at is null`,
        ),
      );
      if (r) linked.push({ type, id: o.id, title: r.title });
    }
  }
  return { roots, folderIds, items, linked, api };
}

const counts = (p: Awaited<ReturnType<typeof plan>>) => ({
  folder: p.folderIds.length,
  note: p.items.note.size,
  task: p.items.task.size,
  voice: p.items.voice.size,
  meeting: p.items.meeting.size,
  file: p.items.file.size,
  issue: p.items.issue.size,
  artifact: p.items.artifact.size,
  email: p.items.email.size,
  snippet: p.items.snippet.size,
  whiteboard: p.items.whiteboard.size,
  request: p.api.requests.length,
});

/**
 * Moves items of the active workspace to another of the person's workspaces
 * (Ambientes: items move, they are never shared). Nothing is copied or
 * deleted; links are kept. `preview` only says what would move, and which
 * linked items could go too (`withLinked`).
 */
export async function moveItems(
  auth: AuthContext,
  input: { items: Ref[]; target: string; withLinked?: boolean; preview?: boolean },
) {
  if (!input.items.length || input.items.some((r) => !(WS_MOVABLE as readonly string[]).includes(r.type)))
    throw new ApiError(400, 'invalid_input');
  return asUser(auth, async (tx) => {
    const [t] = await tx
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, input.target));
    if (!t) throw new ApiError(404, 'not_found');
    const p = await plan(tx, input.items);
    if (input.preview) return { moved: counts(p), linked: p.linked, target: t };
    if (input.withLinked) for (const l of p.linked) p.items[l.type].add(l.id);
    const folderSet = uuids(p.folderIds);
    await allWorkspaces(tx, async () => {
      if (p.folderIds.length)
        await tx.execute(sql`
          update folders set workspace_id = ${t.id},
                 parent_id = case when parent_id = any(${folderSet}) then parent_id else null end
           where id = any(${folderSet})`);
      for (const type of Object.keys(TABLE) as Array<keyof typeof TABLE>) {
        const ids = [...p.items[type]];
        if (!ids.length) continue;
        // an item leaves its folder, unless the folder moves with it
        const folder = IN_FOLDER.has(type)
          ? sql`, folder_id = case when folder_id = any(${folderSet}) then folder_id else null end`
          : sql``;
        await tx.execute(
          sql`update ${sql.identifier(TABLE[type])} set workspace_id = ${t.id}${folder} where id = any(${uuids(ids)}) and owner_id = kh_user_id()`,
        );
      }
      for (const [table, ids] of [
        ['api_requests', p.api.requests],
        ['api_envs', p.api.envs],
      ] as const)
        if (ids.length)
          await tx.execute(
            sql`update ${sql.identifier(table)} set workspace_id = ${t.id} where id = any(${uuids(ids)}) and owner_id = kh_user_id()`,
          );
    });
    return { moved: counts(p), linked: input.withLinked ? p.linked : [], target: t };
  });
}

/**
 * The plan's entitlements as the active workspace sees them: its modules are
 * the ones shown in it (modulesFor). Background work (no wsScope) sees the plan.
 */
export async function entitlementsFor(auth: AuthContext) {
  const ent = await getEntitlements(auth.tenant.id);
  if (!auth.wsScope) return ent;
  return { ...ent, modules: await modulesFor(auth, ent.modules) };
}

/** Like requireModule, for the active workspace. */
export async function requireModuleFor(auth: AuthContext, moduleId: string) {
  const { modules } = await entitlementsFor(auth);
  if (!modules.includes(moduleId))
    throw new ApiError(403, 'module_not_included', undefined, { module: moduleId });
}
