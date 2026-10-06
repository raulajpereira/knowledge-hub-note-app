import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createTask, listTasks } from '@/server/content/tasks';
import { TASK_TYPES } from '@/db/schema';

// GET /tasks (all; the view filters) · POST /tasks { title, type? }
export const GET = handler(async () => {
  const auth = await requireContent('tasks');
  return json({ tasks: await listTasks(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('tasks');
  const input = await body(
    req,
    z.object({
      title: z.string().trim().max(300).default(''),
      type: z.enum(TASK_TYPES).optional(),
      dueOn: z.iso.date().nullable().optional(),
    }),
  );
  return json({ task: await createTask(auth, input) }, { status: 201 });
});
