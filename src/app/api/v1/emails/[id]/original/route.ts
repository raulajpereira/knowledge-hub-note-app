import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { readEmailOriginal } from '@/server/content/emails';
import { download } from '../../download';

/** GET /emails/:id/original — the imported .msg / .eml file. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  const f = await readEmailOriginal(auth, await idParam(ctx));
  if (!f) throw new ApiError(404, 'not_found');
  return download(f.body, f.name);
});
