import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { tasks, taskSubtasks, TASK_PRIORITIES, TASK_REPEATS, TASK_TYPES } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { assertWithinLimit } from '@/server/licensing/entitlements';
import type { AuthContext } from '@/server/auth/session';
import { nextDue } from '@/lib/tasks';
import { checkProject } from './mg';
import { asSharer, asUser } from './tenant';
import { folderError } from './folderError';

// Tasks (prototype isTasks). Every query runs through asUser(), so Row Level
// Security limits it to the caller's own rows.

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskRepeat = (typeof TASK_REPEATS)[number];

export type TaskItem = {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueOn: string | null;
  repeat: TaskRepeat;
  projectId: string | null;
  notes: string;
  pinned: boolean;
  doneAt: string | null;
  createdAt: string;
  subs: { done: number; total: number };
  /** the shared folder it was put in (Partilha), if any */
  sharedFolderId: string | null;
  /** false for someone else's task seen through a shared folder */
  mine: boolean;
};
export type Subtask = { id: string; title: string; done: boolean };
export type Task = TaskItem & { subtasks: Subtask[] };

const cols = {
  id: tasks.id,
  title: tasks.title,
  type: tasks.type,
  priority: tasks.priority,
  dueOn: tasks.dueOn,
  repeat: tasks.repeat,
  projectId: tasks.projectId,
  notes: tasks.notes,
  pinned: tasks.pinned,
  doneAt: tasks.doneAt,
  createdAt: tasks.createdAt,
  sharedFolderId: tasks.sharedFolderId,
  ownerId: tasks.ownerId,
};
type Row = {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueOn: string | null;
  repeat: TaskRepeat;
  projectId: string | null;
  notes: string;
  pinned: boolean;
  doneAt: Date | null;
  createdAt: Date;
  sharedFolderId: string | null;
  ownerId: string;
};
const toItem = ({ ownerId, ...r }: Row, subs: { done: number; total: number }, me: string): TaskItem => ({
  ...r,
  doneAt: r.doneAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  subs,
  mine: ownerId === me,
});

async function subCounts(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, { done: number; total: number }>();
  const rows = await tx
    .select({
      taskId: taskSubtasks.taskId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${taskSubtasks.done})::int`,
    })
    .from(taskSubtasks)
    .where(inArray(taskSubtasks.taskId, ids))
    .groupBy(taskSubtasks.taskId);
  return new Map(rows.map((r) => [r.taskId, { done: r.done, total: r.total }]));
}
const NO_SUBS = { done: 0, total: 0 };

/**
 * All the caller's tasks; filters, search and sorting happen in the view
 * (prototype). With `shared`: the tasks of that shared folder (every member's).
 */
export async function listTasks(auth: AuthContext, shared?: string): Promise<TaskItem[]> {
  return (shared ? asSharer : asUser)(auth, async (tx) => {
    const rows = (await tx
      .select(cols)
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), shared ? eq(tasks.sharedFolderId, shared) : undefined))
      .orderBy(sql`${tasks.createdAt} desc`)
      .limit(2000)) as Row[];
    const subs = await subCounts(
      tx,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toItem(r, subs.get(r.id) ?? NO_SUBS, auth.user.id));
  });
}

async function loadTask(tx: Tx, id: string, me: string): Promise<Task> {
  const [r] = (await tx
    .select(cols)
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))) as Row[];
  if (!r) throw new ApiError(404, 'not_found');
  const subtasks = await tx
    .select({ id: taskSubtasks.id, title: taskSubtasks.title, done: taskSubtasks.done })
    .from(taskSubtasks)
    .where(eq(taskSubtasks.taskId, id))
    .orderBy(asc(taskSubtasks.sort), asc(taskSubtasks.id));
  return {
    ...toItem(r, { done: subtasks.filter((s) => s.done).length, total: subtasks.length }, me),
    subtasks,
  };
}

export const getTask = (auth: AuthContext, id: string) =>
  asSharer(auth, (tx) => loadTask(tx, id, auth.user.id));

export async function createTask(
  auth: AuthContext,
  input: { title: string; type?: TaskType; dueOn?: string | null; sharedFolderId?: string | null },
) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(isNull(tasks.deletedAt))) as [{ n: number }];
    await assertWithinLimit(auth.tenant.id, 'tasks', n);
    const [row] = await tx
      .insert(tasks)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        title: input.title,
        type: input.type ?? 'tech',
        dueOn: input.dueOn ?? null,
        sharedFolderId: input.sharedFolderId ?? null,
      })
      .returning({ id: tasks.id })
      .catch(folderError);
    return loadTask(tx, row!.id, auth.user.id);
  });
}

export type TaskPatch = Partial<{
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueOn: string | null;
  repeat: TaskRepeat;
  sharedFolderId: string | null;
  projectId: string | null;
  notes: string;
  pinned: boolean;
  done: boolean;
}>;

/**
 * Updates a task. Completing a repeating task schedules the next one
 * (same fields, subtasks unticked, due date moved by the interval) and
 * returns it as `next`.
 */
export async function updateTask(auth: AuthContext, id: string, patch: TaskPatch) {
  return asSharer(auth, async (tx) => {
    // one change at a time per task: two "done" clicks (or devices) can't both
    // see it open and schedule the next occurrence twice
    if (patch.done !== undefined)
      await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).for('update');
    const cur = await loadTask(tx, id, auth.user.id);
    const { done, ...fields } = patch;
    // a member edits the task itself; its project, shared folder and pin stay the owner's
    if (
      !cur.mine &&
      (fields.projectId !== undefined || fields.sharedFolderId !== undefined || fields.pinned !== undefined)
    )
      throw new ApiError(403, 'forbidden');
    if (fields.projectId !== undefined) fields.projectId = await checkProject(tx, fields.projectId);
    const set: Partial<typeof tasks.$inferInsert> = { ...fields, updatedAt: new Date() };
    let next: Task | null = null;
    if (done !== undefined && done !== !!cur.doneAt) {
      set.doneAt = done ? new Date() : null;
      const repeat = fields.repeat ?? cur.repeat;
      // the next occurrence belongs to the owner: only their completion schedules it
      if (done && repeat !== 'none' && cur.mine) {
        const due = fields.dueOn !== undefined ? fields.dueOn : cur.dueOn;
        const [n] = await tx
          .insert(tasks)
          .values({
            tenantId: auth.tenant.id,
            ownerId: auth.user.id,
            title: fields.title ?? cur.title,
            type: fields.type ?? cur.type,
            priority: fields.priority ?? cur.priority,
            dueOn: nextDue(due, repeat, new Date()),
            repeat,
            projectId: fields.projectId !== undefined ? fields.projectId : cur.projectId,
            notes: fields.notes ?? cur.notes,
            pinned: fields.pinned ?? cur.pinned,
            sharedFolderId: fields.sharedFolderId !== undefined ? fields.sharedFolderId : cur.sharedFolderId,
          })
          .returning({ id: tasks.id })
          .catch(folderError);
        if (cur.subtasks.length)
          await tx.insert(taskSubtasks).values(
            cur.subtasks.map((s, i) => ({
              tenantId: auth.tenant.id,
              ownerId: auth.user.id,
              taskId: n!.id,
              title: s.title,
              sort: i,
            })),
          );
        // The completed occurrence stops repeating (reopening it won't spawn another).
        set.repeat = 'none';
        next = await loadTask(tx, n!.id, auth.user.id);
      }
    }
    // a read-only member of the task's shared folder can't write it (RLS: no row)
    const ok = await tx
      .update(tasks)
      .set(set)
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id })
      .catch(folderError);
    if (!ok.length) throw new ApiError(403, 'forbidden');
    return { task: await loadTask(tx, id, auth.user.id), next };
  });
}

export async function trashTask(auth: AuthContext, id: string) {
  await asSharer(auth, async (tx) => {
    const r = await tx
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

// ── Subtasks ───────────────────────────────────────────────────────────────
export async function addSubtask(auth: AuthContext, taskId: string, title: string) {
  return asSharer(auth, async (tx) => {
    // the owner or an "edit" member of its shared folder (RLS on the no-op update)
    const ok = await tx
      .update(tasks)
      .set({ updatedAt: sql`${tasks.updatedAt}` })
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    if (!ok.length) throw new ApiError(404, 'not_found');
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(taskSubtasks)
      .where(eq(taskSubtasks.taskId, taskId))) as [{ n: number }];
    if (n >= 100) throw new ApiError(400, 'too_many_subtasks');
    await tx
      .insert(taskSubtasks)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, taskId, title, sort: n });
    return loadTask(tx, taskId, auth.user.id);
  });
}

export async function updateSubtask(
  auth: AuthContext,
  taskId: string,
  subId: string,
  patch: { title?: string; done?: boolean },
) {
  return asSharer(auth, async (tx) => {
    const r = await tx
      .update(taskSubtasks)
      .set(patch)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, taskId)))
      .returning({ id: taskSubtasks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    return loadTask(tx, taskId, auth.user.id);
  });
}

export async function deleteSubtask(auth: AuthContext, taskId: string, subId: string) {
  return asSharer(auth, async (tx) => {
    const r = await tx
      .delete(taskSubtasks)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, taskId)))
      .returning({ id: taskSubtasks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    return loadTask(tx, taskId, auth.user.id);
  });
}
