import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { getVoice, trashVoice, updateVoice } from '@/server/content/voice';

export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('voice');
  return json({ voice: await getVoice(auth, await idParam(ctx)) });
});

/** The transcript is written by hand (no automatic transcription in this release). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('voice');
  const patch = await body(
    req,
    z.object({
      title: z.string().max(300).optional(),
      transcript: z.string().max(100_000).optional(),
      notes: z.string().max(20_000).optional(),
      pinned: z.boolean().optional(),
    }),
  );
  return json({ voice: await updateVoice(auth, await idParam(ctx), patch) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('voice');
  await trashVoice(auth, await idParam(ctx));
  return json({ ok: true });
});
