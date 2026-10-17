import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { fileOcrText } from '@/server/search/status';

/** GET /drive/:id/text — text recognised in the file (OCR), if any: { ocr: { status, text, pages } | null }. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  return json({ ocr: await fileOcrText(auth, await idParam(ctx)) });
});
