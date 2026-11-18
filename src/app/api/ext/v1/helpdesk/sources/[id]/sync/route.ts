import { body, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, type IdCtx } from '@/server/content/guard';
import { extAuth, syncSource, SyncZ } from '@/server/helpdesk';
import { extHandler } from '@/server/helpdesk/http';

/** POST /ext/v1/helpdesk/sources/:id/sync — a read (the table), or the problem met ({ error }). */
export const POST = extHandler(async (req, ctx: IdCtx) => {
  const auth = await extAuth(req);
  if (!(await allow(`hd-sync:${auth.user.id}`, 120, 3600))) throw new ApiError(429, 'too_many_requests');
  const input = await body(req, SyncZ);
  return json(await syncSource(auth, await idParam(ctx), input));
});
