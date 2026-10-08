import { handler } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { readDriveFile } from '@/server/content/drive';
import { fileResponse } from '@/server/fileResponse';

/** GET /drive/:id/raw — the file (inline for previewable types; ?dl=1 always a download); byte ranges. */
export const GET = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('files');
  const f = await readDriveFile(auth, await idParam(ctx), req.headers.get('range'));
  return fileResponse(f, { download: new URL(req.url).searchParams.has('dl') });
});
