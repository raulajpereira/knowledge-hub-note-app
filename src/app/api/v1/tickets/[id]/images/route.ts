import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addTicketImage, importTicketImage } from '@/server/content/tickets';

const MAX = 5 * 1024 * 1024;

/**
 * POST /tickets/:id/images — an image for the notes: raw image body, or JSON
 * { url } to import one (fetched by the server). Streamed back by
 * /tickets/files/:id; counts toward the uploader's space.
 */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const ticketId = await idParam(ctx);
  if (!(await allow(`ticket-img:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  let id: string;
  if (req.headers.get('content-type')?.startsWith('application/json')) {
    const { url } = await body(req, z.object({ url: z.url({ protocol: /^https?$/ }).max(2048) }));
    id = await importTicketImage(auth, ticketId, url);
  } else {
    if (Number(req.headers.get('content-length') ?? 0) > MAX)
      throw new ApiError(413, 'file_too_large', undefined, { max: MAX });
    id = await addTicketImage(auth, ticketId, new Uint8Array(await req.arrayBuffer()));
  }
  return json({ id, src: `/api/v1/tickets/files/${id}` }, { status: 201 });
});
