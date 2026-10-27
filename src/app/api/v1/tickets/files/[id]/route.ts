import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteTicketFile, readTicketFile } from '@/server/content/tickets';
import { fileResponse } from '@/server/fileResponse';

/** GET /tickets/files/:id — an attachment or an image of the notes (inline for safe types; ?dl=1 downloads). */
export const GET = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const f = await readTicketFile(auth, await idParam(ctx), req.headers.get('range'));
  return fileResponse(f, { download: new URL(req.url).searchParams.has('dl') });
});

/** DELETE — its uploader or the ticket's owner (the stored object goes after commit). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  await deleteTicketFile(auth, await idParam(ctx));
  return json({ ok: true });
});
