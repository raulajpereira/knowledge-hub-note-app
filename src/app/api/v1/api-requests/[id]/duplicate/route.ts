import { body, handler, json } from '@/server/http';
import { copySuffix, idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { duplicateApiRequest } from '@/server/content/apiPlayground';

export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('api');
  const { suffix } = await body(req, copySuffix);
  return json({ request: await duplicateApiRequest(auth, await idParam(ctx), suffix) }, { status: 201 });
});
