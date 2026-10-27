import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { abortTicketUpload, completeTicketUpload } from '@/server/content/tickets';

type Ctx = { params: Promise<{ id: string }> };

/** POST /tickets/uploads/:id — every chunk sent: the attachment is kept. */
export const POST = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('tickets');
  return json({ file: await completeTicketUpload(auth, (await ctx.params).id) }, { status: 201 });
});

/** DELETE /tickets/uploads/:id — cancel. */
export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('tickets');
  await abortTicketUpload(auth, (await ctx.params).id);
  return json({ ok: true });
});
