import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { idParam, type IdCtx } from '@/server/content/guard';
import { answerInvite } from '@/server/share/folders';

/** POST /share/invites/:id { accept } — accept or decline an invitation. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireAuth();
  const { accept } = await body(req, z.object({ accept: z.boolean() }));
  await answerInvite(auth, await idParam(ctx), accept);
  return json({ ok: true });
});
