import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { createWorkspace, workspacesOf } from '@/server/workspaces';

/** GET /workspaces — the person's workspaces and the one active on this device. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { list, active } = await workspacesOf(auth);
  return json({ workspaces: list, active: active.id });
});

/** POST /workspaces — a new workspace (plan limit "Ambientes por pessoa"). */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const input = await body(
    req,
    z
      .object({
        name: z.string().max(60),
        color: z.string().max(40).optional(),
        icon: z.string().max(16).optional(),
        modules: z.array(z.string().max(40)).max(100).nullable().optional(),
      })
      .strict(),
  );
  return json({ workspace: await createWorkspace(auth, input) }, { status: 201 });
});
