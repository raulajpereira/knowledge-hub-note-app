import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { dropShare, getShare } from '@/server/shareInbox';

type Ctx = { params: Promise<{ token: string }> };

/** GET /share-target/:token — what was shared (text, link, files' names) · DELETE — done with it */
export const GET = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  const { token } = await ctx.params;
  return json({ share: await getShare(auth.user.id, token) });
});

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  const { token } = await ctx.params;
  await dropShare(auth.user.id, token);
  return json({ ok: true });
});
