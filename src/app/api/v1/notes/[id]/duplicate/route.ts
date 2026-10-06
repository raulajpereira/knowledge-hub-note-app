import { body, handler, json } from '@/server/http';
import { copySuffix, idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { duplicateNote } from '@/server/content/notes';

export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  const { suffix } = await body(req, copySuffix);
  return json({ note: await duplicateNote(auth, await idParam(ctx), suffix) }, { status: 201 });
});
