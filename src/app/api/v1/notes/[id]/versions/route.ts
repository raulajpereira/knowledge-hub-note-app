import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { listNoteVersions } from '@/server/content/noteVersions';

/** GET /notes/:id/versions — the note's history, newest first (owner and members of its shared folder). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  return json({ versions: await listNoteVersions(auth, await idParam(ctx)) });
});
