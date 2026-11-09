import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ALL_WORKSPACES, requireAuth, WORKSPACE_COOKIE } from '@/server/auth/request';
import { cookieOptions } from '@/server/auth/session';
import { assertOwnWorkspace } from '@/server/workspaces';

/**
 * PUT /workspaces/active { id } — the workspace this device works in (a cookie:
 * each device its own); "all" = the combined view.
 */
export const PUT = handler(async (req) => {
  const auth = await requireAuth();
  const { id } = await body(req, z.object({ id: z.union([z.uuid(), z.literal(ALL_WORKSPACES)]) }));
  if (id !== ALL_WORKSPACES) await assertOwnWorkspace(auth, id);
  const res = json({ active: id });
  res.cookies.set(WORKSPACE_COOKIE, id, { ...cookieOptions(true), maxAge: 400 * 24 * 3600 });
  return res;
});
