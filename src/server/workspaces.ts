import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { workspaces } from '@/db/schema';
import { MAX_PREFS_BYTES, mergePrefs, parsePrefsPatch, prefAllowed, type Prefs } from '@/lib/prefs';
import { WS_PREF_KEYS, wsColor, wsIcon, type Workspace } from '@/lib/workspaces';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';
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

/** Name, colour and icon of one of the person's workspaces. */
export async function updateWorkspace(
  auth: AuthContext,
  id: string,
  patch: { name?: string; color?: string; icon?: string },
): Promise<Workspace> {
  const set: Partial<typeof workspaces.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 60) throw new ApiError(400, 'validation', 'name');
    set.name = name;
  }
  if (patch.color !== undefined) {
    if (!wsColor(patch.color)) throw new ApiError(400, 'validation', 'color');
    set.color = patch.color;
  }
  if (patch.icon !== undefined) {
    if (!wsIcon(patch.icon)) throw new ApiError(400, 'validation', 'icon');
    set.icon = patch.icon;
  }
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
