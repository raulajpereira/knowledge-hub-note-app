import 'server-only';
import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { notes, savedViews, tasks, TASK_PRIORITIES } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { reachableFolder } from '@/server/share/folders';
import { asSharer, asUser, type Tx } from './tenant';
import { noteConds, type NoteFilter } from './notes';

// "Vistas guardadas" (smart folders): a named filter of Notes or Tasks, kept
// in saved_views (owner-only, RLS) and pinned in the sidebar with a live
// count. The filter is validated per kind; the pages put it in the URL.

export const MAX_VIEWS = 50;
const SHARED = /^sh:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tag = z.string().trim().min(1).max(40);

export const noteViewFilter = z
  .object({
    /** 'all' | 'fav' | a notebook id | 'sh:<shared folder id>' */
    folder: z.union([z.enum(['all', 'fav']), z.uuid(), z.string().regex(SHARED)]).default('all'),
    tags: z.array(tag).max(10).default([]),
    tagMode: z.enum(['any', 'all']).default('any'),
    q: z.string().trim().max(200).default(''),
    days: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict();

export const TASK_DUE = ['any', 'overdue', 'today', 'week', 'month', 'none'] as const;
export const taskViewFilter = z
  .object({
    status: z.enum(['active', 'done', 'all']).default('active'),
    type: z.enum(['all', 'tech', 'mgmt']).default('all'),
    priority: z.array(z.enum(TASK_PRIORITIES)).max(3).default([]),
    /** a Management project, 'none' (no project) or null (any) */
    project: z
      .union([z.uuid(), z.literal('none')])
      .nullable()
      .default(null),
    due: z.enum(TASK_DUE).default('any'),
    /** the tasks of one shared folder */
    shared: z.uuid().nullable().default(null),
    q: z.string().trim().max(200).default(''),
  })
  .strict();

export type NoteViewFilter = z.infer<typeof noteViewFilter>;
export type TaskViewFilter = z.infer<typeof taskViewFilter>;
export type SavedView =
  | {
      id: string;
      kind: 'notes';
      name: string;
      filter: NoteViewFilter;
      position: number;
      count: number | null;
    }
  | {
      id: string;
      kind: 'tasks';
      name: string;
      filter: TaskViewFilter;
      position: number;
      count: number | null;
    };

export const viewInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notes'), name: z.string().trim().min(1).max(60), filter: noteViewFilter }),
  z.object({ kind: z.literal('tasks'), name: z.string().trim().min(1).max(60), filter: taskViewFilter }),
]);

/** Extra Notes list filters from the query string (GET /notes): tag=…&tag=…&tm=all&days=30. */
export function noteViewParams(sp: URLSearchParams): Pick<NoteFilter, 'tags' | 'tagMode' | 'days'> {
  const tags = [
    ...new Set(
      sp
        .getAll('tag')
        .map((x) => x.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 10);
  const d = Number(sp.get('days'));
  return {
    tags: tags.length ? tags : undefined,
    tagMode: sp.get('tm') === 'all' ? 'all' : 'any',
    days: Number.isInteger(d) && d >= 1 && d <= 3650 ? d : undefined,
  };
}

/** The WHERE of a task view (the Tasks page applies the same rules in the browser). */
export function taskConds(f: TaskViewFilter): SQL[] {
  const c: SQL[] = [isNull(tasks.deletedAt)];
  if (f.status === 'active') c.push(isNull(tasks.doneAt));
  if (f.status === 'done') c.push(isNotNull(tasks.doneAt));
  if (f.type !== 'all') c.push(eq(tasks.type, f.type));
  if (f.priority.length) c.push(inArray(tasks.priority, f.priority));
  if (f.project === 'none') c.push(isNull(tasks.projectId));
  else if (f.project) c.push(eq(tasks.projectId, f.project));
  if (f.shared) c.push(eq(tasks.sharedFolderId, f.shared));
  if (f.due === 'none') c.push(isNull(tasks.dueOn));
  if (f.due === 'overdue') c.push(sql`${tasks.dueOn} < current_date`);
  if (f.due === 'today') c.push(sql`${tasks.dueOn} = current_date`);
  if (f.due === 'week') c.push(sql`${tasks.dueOn} between current_date and current_date + 7`);
  if (f.due === 'month') c.push(sql`${tasks.dueOn} between current_date and current_date + 30`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    c.push(or(ilike(tasks.title, like), ilike(tasks.notes, like))!);
  }
  return c;
}

const count = async (tx: Tx, table: typeof notes | typeof tasks, conds: SQL[]) => {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(...conds));
  return r?.n ?? 0;
};

/** Live count of a view (null when its folder is gone or no longer reachable). */
type ViewSpec = { kind: 'notes'; filter: NoteViewFilter } | { kind: 'tasks'; filter: TaskViewFilter };

async function viewCount(auth: AuthContext, v: ViewSpec): Promise<number | null> {
  try {
    if (v.kind === 'notes') {
      const f = v.filter;
      const base: NoteFilter = {
        search: f.q || undefined,
        tags: f.tags,
        tagMode: f.tagMode,
        days: f.days ?? undefined,
        fav: f.folder === 'fav',
      };
      if (f.folder.startsWith('sh:')) {
        const sh = await reachableFolder(auth, f.folder.slice(3));
        if (sh.kind !== 'notes') return null;
        return await asSharer(auth, (tx) =>
          count(tx, notes, noteConds({ ...base, shared: { id: sh.id, folderId: sh.folderId } })),
        );
      }
      const folder = f.folder === 'all' || f.folder === 'fav' ? undefined : f.folder;
      return await asUser(auth, (tx) => count(tx, notes, noteConds({ ...base, folder })));
    }
    const f = v.filter;
    if (f.shared) {
      const sh = await reachableFolder(auth, f.shared);
      if (sh.kind !== 'tasks') return null;
      return await asSharer(auth, (tx) => count(tx, tasks, taskConds(f)));
    }
    return await asUser(auth, (tx) => count(tx, tasks, taskConds(f)));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Parses a stored filter (a view saved by an older version falls back to the defaults it lacks). */
function parsed(kind: 'notes' | 'tasks', raw: unknown) {
  const r = (kind === 'notes' ? noteViewFilter : taskViewFilter).safeParse(raw);
  return r.success ? r.data : (kind === 'notes' ? noteViewFilter : taskViewFilter).parse({});
}

/** The caller's views (only of the modules in the plan), each with its live count. */
export async function listViews(
  auth: AuthContext,
  modules: ReadonlySet<string>,
  opts: { counts?: boolean } = {},
): Promise<SavedView[]> {
  const rows = await asUser(auth, (tx) =>
    tx.select().from(savedViews).orderBy(asc(savedViews.position), asc(savedViews.createdAt)),
  );
  const out: SavedView[] = [];
  for (const r of rows) {
    if (!modules.has(r.kind)) continue;
    const v = {
      id: r.id,
      kind: r.kind,
      name: r.name,
      position: r.position,
      filter: parsed(r.kind, r.filter),
    };
    out.push({
      ...v,
      count: opts.counts === false ? null : await viewCount(auth, v as ViewSpec),
    } as SavedView);
  }
  return out;
}

export async function createView(auth: AuthContext, input: z.infer<typeof viewInput>): Promise<SavedView> {
  const v = await asUser(auth, async (tx) => {
    const [{ n, max }] = (await tx
      .select({
        n: sql<number>`count(*)::int`,
        max: sql<number>`coalesce(max(${savedViews.position}), -1)::int`,
      })
      .from(savedViews)) as [{ n: number; max: number }];
    if (n >= MAX_VIEWS) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(savedViews)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: input.kind,
        name: input.name,
        filter: input.filter,
        position: max + 1,
      })
      .returning();
    return r!;
  });
  const s = { id: v.id, kind: v.kind, name: v.name, position: v.position, filter: parsed(v.kind, v.filter) };
  return { ...s, count: await viewCount(auth, s as ViewSpec) } as SavedView;
}

export async function updateView(
  auth: AuthContext,
  id: string,
  patch: { name?: string; filter?: unknown },
): Promise<void> {
  await asUser(auth, async (tx) => {
    const [cur] = await tx.select({ kind: savedViews.kind }).from(savedViews).where(eq(savedViews.id, id));
    if (!cur) throw new ApiError(404, 'not_found');
    const filter =
      patch.filter === undefined
        ? undefined
        : (cur.kind === 'notes' ? noteViewFilter : taskViewFilter).parse(patch.filter);
    await tx
      .update(savedViews)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(filter !== undefined ? { filter } : {}),
        updatedAt: new Date(),
      })
      .where(eq(savedViews.id, id));
  });
}

export async function deleteView(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx.delete(savedViews).where(eq(savedViews.id, id)).returning({ id: savedViews.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** New order of the caller's views (ids not theirs are ignored by RLS). */
export async function reorderViews(auth: AuthContext, ids: string[]) {
  await asUser(auth, async (tx) => {
    for (const [i, id] of ids.entries())
      await tx.update(savedViews).set({ position: i }).where(eq(savedViews.id, id));
  });
}
