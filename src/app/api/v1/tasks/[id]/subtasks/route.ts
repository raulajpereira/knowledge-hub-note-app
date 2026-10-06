import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addSubtask } from '@/server/content/tasks';

export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tasks');
  const { title } = await body(req, z.object({ title: z.string().trim().min(1).max(300) }));
  return json({ task: await addSubtask(auth, await idParam(ctx), title) }, { status: 201 });
});
