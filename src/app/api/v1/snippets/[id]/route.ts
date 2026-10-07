import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { trashSnippet, updateSnippet } from '@/server/content/snippets';
import { SnippetPatch } from '../schemas';

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('devlib');
  const patch = await body(req, SnippetPatch);
  return json({ snippet: await updateSnippet(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('devlib');
  await trashSnippet(auth, await idParam(ctx));
  return json({ ok: true });
});
