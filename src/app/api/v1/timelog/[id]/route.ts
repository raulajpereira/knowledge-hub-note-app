import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { deleteEntry, TimePatch, updateEntry } from '@/server/content/timelog';
import { timelogAuth, tzOf } from '@/server/content/timelogHttp';

/** PATCH /timelog/:id — edit (times, fields, "Folha de tempos"). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const input = await body(req, TimePatch);
  const { auth, mods } = await timelogAuth();
  return json({ entry: await updateEntry(auth, await idParam(ctx), input, mods, tzOf(req)) });
});

/** DELETE /timelog/:id — to the Trash. */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const { auth } = await timelogAuth();
  await deleteEntry(auth, await idParam(ctx));
  return json({ ok: true });
});
