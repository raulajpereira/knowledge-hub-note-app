import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { duplicateObject } from '@/server/content/codelib';

export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('codelib');
  return json({ object: await duplicateObject(auth, await idParam(ctx)) }, { status: 201 });
});
