import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { deleteSubtask, updateSubtask } from '@/server/content/tasks';

type Ctx = { params: Promise<{ id: string; subId: string }> };
const ids = async (ctx: Ctx) => {
  const p = await ctx.params;
  return [z.uuid().parse(p.id), z.uuid().parse(p.subId)] as const;
};

export const PATCH = handler(async (req, ctx: Ctx) => {
  const auth = await requireContent('tasks');
  const patch = await body(
    req,
    z.object({ title: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional() }),
  );
  const [id, subId] = await ids(ctx);
  return json({ task: await updateSubtask(auth, id, subId, patch) });
});

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('tasks');
  const [id, subId] = await ids(ctx);
  return json({ task: await deleteSubtask(auth, id, subId) });
});
