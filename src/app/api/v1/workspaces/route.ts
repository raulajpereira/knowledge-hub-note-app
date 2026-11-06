import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { workspacesOf } from '@/server/workspaces';

/** GET /workspaces — the person's workspaces and the one active on this device. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { list, active } = await workspacesOf(auth);
  return json({ workspaces: list, active: active.id });
});
