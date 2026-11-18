import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { importSource, SourcePatch } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/sources/:id/import — saves the settings, applies the last read and turns the sync on. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const input = await body(req, SourcePatch);
  const auth = await helpdeskAuth();
  return json(await importSource(auth, await idParam(ctx), input));
});
