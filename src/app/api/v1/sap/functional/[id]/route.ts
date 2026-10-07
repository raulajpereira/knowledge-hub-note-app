import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashRecord, updateRecord } from '@/server/content/functional';
import { FnPageParam, FnPatchInput } from '../../schemas';

// ?page= names the page (module) the record belongs to; another page's id is 404.
const pageOf = (req: Request) => FnPageParam.parse(new URL(req.url).searchParams.get('page'));

/** PATCH with `base` (the updatedAt edited from): 409 conflict when someone else saved meanwhile, unless `force`. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const page = pageOf(req);
  const auth = await requireContent(page);
  const id = await idParam(ctx);
  return json({ record: await updateRecord(auth, page, id, await body(req, FnPatchInput)) });
});

export const DELETE = handler(async (req, ctx: IdCtx) => {
  const page = pageOf(req);
  const auth = await requireContent(page);
  await trashRecord(auth, page, await idParam(ctx));
  return json({ ok: true });
});
