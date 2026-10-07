import { body, handler, json } from '@/server/http';
import { copySuffix, idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { duplicateBoard } from '@/server/content/whiteboards';

export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('whiteboard');
  const { suffix } = await body(req, copySuffix);
  return json({ board: await duplicateBoard(auth, await idParam(ctx), suffix) }, { status: 201 });
});
