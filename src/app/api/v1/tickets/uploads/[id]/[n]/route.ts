import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { uploadTicketPart } from '@/server/content/tickets';
import { UPLOAD_PART } from '@/lib/drive';

type Ctx = { params: Promise<{ id: string; n: string }> };

/** PUT /tickets/uploads/:id/:n — chunk n (1-based) as the raw body, at most one part size. */
export const PUT = handler(async (req, ctx: Ctx) => {
  const auth = await requireContent('tickets');
  const { id, n } = await ctx.params;
  const len = Number(req.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(len) || len > UPLOAD_PART)
    throw new ApiError(413, 'file_too_large', undefined, { max: UPLOAD_PART });
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > UPLOAD_PART)
    throw new ApiError(413, 'file_too_large', undefined, { max: UPLOAD_PART });
  await uploadTicketPart(auth, id, Number(n), buf);
  return json({ ok: true });
});
