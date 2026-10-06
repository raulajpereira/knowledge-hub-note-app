import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { endOtherSessions, listSessions } from '@/server/account';

export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ sessions: await listSessions(auth) });
});

/** DELETE /me/sessions → end every session except this one. */
export const DELETE = handler(async () => {
  const auth = await requireAuth();
  return json({ ended: await endOtherSessions(auth) });
});
