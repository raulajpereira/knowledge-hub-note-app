import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { startTicketUpload } from '@/server/content/tickets';
import { FILES_MAX_MB_CAP } from '@/lib/drive';

/** POST /tickets/:id/uploads { name, size, mime? } — opens a chunked upload of an attachment. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const id = await idParam(ctx);
  if (!(await allow(`ticket-up:${auth.user.id}`, 120, 600))) throw new ApiError(429, 'too_many_requests');
  const input = await body(
    req,
    z.object({
      name: z.string().min(1).max(1000),
      size: z
        .number()
        .int()
        .min(0)
        .max(FILES_MAX_MB_CAP * 1024 * 1024),
      mime: z.string().max(200).optional(),
    }),
  );
  return json(await startTicketUpload(auth, id, input), { status: 201 });
});
