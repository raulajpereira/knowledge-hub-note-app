import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { endSession } from '@/server/account';

export const DELETE = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAuth();
  const { id } = await ctx.params;
  await endSession(auth, z.uuid().parse(id));
  return json({ ok: true });
});
