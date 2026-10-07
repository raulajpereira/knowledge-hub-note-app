import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { MAX_HTML, saveArtifactHtml } from '@/server/content/artifacts';

/** PUT /artifacts/:id/html { html } — "Guardar Versão". */
export const PUT = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_HTML * 2 + 4096)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_HTML });
  const { html } = await body(req, z.object({ html: z.string().max(MAX_HTML) }));
  return json({ artifact: await saveArtifactHtml(auth, await idParam(ctx), html) });
});
