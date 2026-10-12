import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { listInvites } from '@/server/share/folders';

/** GET /share/invites — shared folders waiting for the caller to accept. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ invites: await listInvites(auth) });
});
