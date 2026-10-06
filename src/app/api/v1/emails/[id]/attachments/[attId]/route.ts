import { z } from 'zod';
import { handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { readEmailAttachment } from '@/server/content/emails';
import { download } from '../../../download';

type Ctx = { params: Promise<{ id: string; attId: string }> };

/** GET /emails/:id/attachments/:attId — always served as a download. */
export const GET = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('emails');
  const p = await ctx.params;
  const f = await readEmailAttachment(auth, z.uuid().parse(p.id), z.uuid().parse(p.attId));
  if (!f) throw new ApiError(404, 'not_found');
  return download(f.body, f.name);
});
