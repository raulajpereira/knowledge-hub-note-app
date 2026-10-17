import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getSapNote, trashSapNote, updateSapNote } from '@/server/content/sapNotes';
import { SapNoteFields } from '@/lib/sapNotes';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('sapnotes');
  return json({ note: await getSapNote(auth, await idParam(ctx)) });
});

export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('sapnotes');
  const id = await idParam(ctx);
  return json({ note: await updateSapNote(auth, id, await body(req, SapNoteFields.partial())) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('sapnotes');
  await trashSapNote(auth, await idParam(ctx));
  return json({ ok: true });
});
