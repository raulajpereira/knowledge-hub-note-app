import { handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { itemToTicket } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/items/:id/ticket — "Criar ticket": a copy in Tickets. */
export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await helpdeskAuth();
  return json(await itemToTicket(auth, await idParam(ctx)), { status: 201 });
});
