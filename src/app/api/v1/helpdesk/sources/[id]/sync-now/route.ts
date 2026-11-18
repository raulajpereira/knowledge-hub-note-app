import { handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requestSync } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/sources/:id/sync-now — the extension reads it at its next minute. */
export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await helpdeskAuth();
  await requestSync(auth, await idParam(ctx));
  return json({ ok: true });
});
