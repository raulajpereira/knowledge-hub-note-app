import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { deleteWorkspace, updateWorkspace } from '@/server/workspaces';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /workspaces/:id — name, colour, icon, modules. */
export const PATCH = handler(async (req, ctx: Ctx) => {
  const auth = await requireAuth();
  const id = z.uuid().parse((await ctx.params).id);
  const patch = await body(
    req,
    z
      .object({
        name: z.string().max(60),
        color: z.string().max(40),
        icon: z.string().max(16),
        modules: z.array(z.string().max(40)).max(100).nullable(),
      })
      .partial()
      .strict(),
  );
  return json({ workspace: await updateWorkspace(auth, id, patch) });
});

/** DELETE /workspaces/:id — only an empty workspace, never the last one (409 otherwise). */
export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireAuth();
  const id = z.uuid().parse((await ctx.params).id);
  await deleteWorkspace(auth, id);
  return json({ ok: true });
});
