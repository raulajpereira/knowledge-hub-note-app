import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { getSource, SourcePatch, updateSource } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** GET /helpdesk/sources/:id — a linked page (with the columns of its last read). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await helpdeskAuth();
  return json({ source: await getSource(auth, await idParam(ctx)) });
});

/** PATCH /helpdesk/sources/:id — name, interval, when a ticket leaves, mapping, paused. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const input = await body(req, SourcePatch);
  const auth = await helpdeskAuth();
  return json({ source: await updateSource(auth, await idParam(ctx), input) });
});
