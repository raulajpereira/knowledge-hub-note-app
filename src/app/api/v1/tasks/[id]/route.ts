import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getTask, trashTask, updateTask } from '@/server/content/tasks';
import { TASK_PRIORITIES, TASK_REPEATS, TASK_TYPES } from '@/db/schema';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tasks');
  return json({ task: await getTask(auth, await idParam(ctx)) });
});

const day = z.iso.date();

/** PATCH /tasks/:id — any field; { done: true } on a repeating task returns the next one as `next`. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tasks');
  const patch = await body(
    req,
    z.object({
      title: z.string().max(300).optional(),
      type: z.enum(TASK_TYPES).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      dueOn: day.nullable().optional(),
      repeat: z.enum(TASK_REPEATS).optional(),
      projectId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
      notes: z.string().max(20_000).optional(),
      pinned: z.boolean().optional(),
      done: z.boolean().optional(),
    }),
  );
  return json(await updateTask(auth, await idParam(ctx), patch));
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tasks');
  await trashTask(auth, await idParam(ctx));
  return json({ ok: true });
});
