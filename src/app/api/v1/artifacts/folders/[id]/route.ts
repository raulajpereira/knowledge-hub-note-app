import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { deleteArtifactFolder } from '@/server/content/artifacts';

/** DELETE /artifacts/folders/:id — the artifacts stay, without a folder. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('artifacts');
  await deleteArtifactFolder(auth, await idParam(ctx));
  return json({ ok: true });
});
