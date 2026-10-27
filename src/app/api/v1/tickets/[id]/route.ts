import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getTicket, trashTicket, updateTicket } from '@/server/content/tickets';
import { TicketPatch } from '../schemas';

/** GET /tickets/:id — with its notes, history, attachments, the caller's permission and the type list. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  return json({ ticket: await getTicket(auth, await idParam(ctx)) });
});

/** PATCH — owner or an 'edit' member of its shared folder; returns the history entries it made. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  const patch = await body(req, TicketPatch);
  return json(await updateTicket(auth, await idParam(ctx), patch));
});

/** DELETE → Trash (30 days); the owner's. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('tickets');
  await trashTicket(auth, await idParam(ctx));
  return json({ ok: true });
});
