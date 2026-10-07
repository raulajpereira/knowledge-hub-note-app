import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashIssue, updateIssue } from '@/server/content/issues';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/db/schema';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('issues');
  const patch = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(300).optional(),
      status: z.enum(ISSUE_STATUSES).optional(),
      priority: z.enum(ISSUE_PRIORITIES).optional(),
      projectId: z.uuid().nullable().optional(),
      dueOn: z.iso.date().nullable().optional(),
      waiting: z.string().max(300).optional(),
      description: z.string().max(20_000).optional(),
      notes: z.string().max(20_000).optional(),
    }),
  );
  return json({ issue: await updateIssue(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('issues');
  await trashIssue(auth, await idParam(ctx));
  return json({ ok: true });
});
