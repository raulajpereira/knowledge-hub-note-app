import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createTask, listTasks } from '@/server/content/tasks';
import { reachableFolder } from '@/server/share/folders';
import { TASK_TYPES } from '@/db/schema';

// GET /tasks (all; the view filters) · ?shared=<folder> the tasks of a shared folder · POST /tasks { title, type?, sharedFolderId? }
export const GET = handler(async (req) => {
  const auth = await requireContent('tasks');
  const sh = new URL(req.url).searchParams.get('shared');
  const shared = sh ? await reachableFolder(auth, z.uuid().parse(sh)) : undefined;
  if (shared && shared.kind !== 'tasks') return json({ tasks: [] });
  return json({ tasks: await listTasks(auth, shared?.id) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('tasks');
  const input = await body(
    req,
    z.object({
      title: z.string().trim().max(300).default(''),
      type: z.enum(TASK_TYPES).optional(),
      dueOn: z.iso.date().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ task: await createTask(auth, input) }, { status: 201 });
});
