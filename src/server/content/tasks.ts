import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { tasks, taskSubtasks, TASK_PRIORITIES, TASK_REPEATS, TASK_TYPES } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { assertWithinLimit } from '@/server/licensing/entitlements';
import type { AuthContext } from '@/server/auth/session';
import { nextDue } from '@/lib/tasks';
import { checkProject } from './mg';
import { asUser } from './tenant';

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
};
const toItem = (r: Row, subs: { done: number; total: number }): TaskItem => ({
  ...r,
  doneAt: r.doneAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  subs,
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

/** All the caller's tasks; filters, search and sorting happen in the view (prototype). */
export async function listTasks(auth: AuthContext): Promise<TaskItem[]> {
  return asUser(auth, async (tx) => {
    const rows = (await tx
      .select(cols)
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(sql`${tasks.createdAt} desc`)
      .limit(2000)) as Row[];
    const subs = await subCounts(
      tx,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toItem(r, subs.get(r.id) ?? NO_SUBS));
  });
}

async function loadTask(tx: Tx, id: string): Promise<Task> {
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
    ...toItem(r, { done: subtasks.filter((s) => s.done).length, total: subtasks.length }),
    subtasks,
  };
}

export const getTask = (auth: AuthContext, id: string) => asUser(auth, (tx) => loadTask(tx, id));

export async function createTask(
  auth: AuthContext,
  input: { title: string; type?: TaskType; dueOn?: string | null },
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
      })
      .returning({ id: tasks.id });
    return loadTask(tx, row!.id);
  });
}

export type TaskPatch = Partial<{
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueOn: string | null;
  repeat: TaskRepeat;
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
  return asUser(auth, async (tx) => {
    const cur = await loadTask(tx, id);
    const { done, ...fields } = patch;
    if (fields.projectId !== undefined) fields.projectId = await checkProject(tx, fields.projectId);
    const set: Partial<typeof tasks.$inferInsert> = { ...fields, updatedAt: new Date() };
    let next: Task | null = null;
    if (done !== undefined && done !== !!cur.doneAt) {
      set.doneAt = done ? new Date() : null;
      const repeat = fields.repeat ?? cur.repeat;
      if (done && repeat !== 'none') {
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
          })
          .returning({ id: tasks.id });
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
        next = await loadTask(tx, n!.id);
      }
    }
    await tx.update(tasks).set(set).where(eq(tasks.id, id));
    return { task: await loadTask(tx, id), next };
  });
}

export async function trashTask(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
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
  return asUser(auth, async (tx) => {
    await loadTask(tx, taskId); // owner check (RLS) before writing the child row
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(taskSubtasks)
      .where(eq(taskSubtasks.taskId, taskId))) as [{ n: number }];
    if (n >= 100) throw new ApiError(400, 'too_many_subtasks');
    await tx
      .insert(taskSubtasks)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, taskId, title, sort: n });
    return loadTask(tx, taskId);
  });
}

export async function updateSubtask(
  auth: AuthContext,
  taskId: string,
  subId: string,
  patch: { title?: string; done?: boolean },
) {
  return asUser(auth, async (tx) => {
    const r = await tx
      .update(taskSubtasks)
      .set(patch)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, taskId)))
      .returning({ id: taskSubtasks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    return loadTask(tx, taskId);
  });
}

export async function deleteSubtask(auth: AuthContext, taskId: string, subId: string) {
  return asUser(auth, async (tx) => {
    const r = await tx
      .delete(taskSubtasks)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, taskId)))
      .returning({ id: taskSubtasks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    return loadTask(tx, taskId);
  });
}
