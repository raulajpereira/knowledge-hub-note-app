import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addComment } from '@/server/content/tickets';

/** POST /tickets/:id/comments { body } — a work-log entry (who and when are the server's). */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const id = await idParam(ctx);
  if (!(await allow(`ticket-comment:${auth.user.id}`, 120, 600)))
    throw new ApiError(429, 'too_many_requests');
  const { body: text } = await body(req, z.object({ body: z.string().trim().min(1).max(20_000) }));
  return json({ event: await addComment(auth, id, text) }, { status: 201 });
});
