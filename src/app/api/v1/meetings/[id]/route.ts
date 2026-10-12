import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getMeeting, trashMeeting, updateMeeting } from '@/server/content/meetings';
import { MeetingPatch } from '../schemas';

/** GET /meetings/:id — the record with its topics document (the list leaves it out). */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  return json({ meeting: await getMeeting(auth, await idParam(ctx)) });
});

/** PATCH — `topicsDoc` (TipTap JSON, validated) also sets `topics` to its plain text. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  const patch = await body(req, MeetingPatch);
  return json({ meeting: await updateMeeting(auth, await idParam(ctx), patch) });
});

/** DELETE → Trash (30 days). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  await trashMeeting(auth, await idParam(ctx));
  return json({ ok: true });
});
