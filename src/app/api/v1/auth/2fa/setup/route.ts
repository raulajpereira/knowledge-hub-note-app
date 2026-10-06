import { handler, json } from '@/server/http';
import { requireAuth, requireRecentReauth } from '@/server/auth/request';
import { beginTotpSetup } from '@/server/auth/service';

export const POST = handler(async () => {
  const auth = await requireAuth();
  requireRecentReauth(auth);
  return json(await beginTotpSetup(auth));
});
