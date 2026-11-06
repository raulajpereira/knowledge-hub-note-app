import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { WS_MOVABLE } from '@/lib/workspaces';
import { moveItems } from '@/server/workspaces';

/**
 * POST /workspaces/move — moves items of the active workspace to another one
 * (with `preview`: only what would move, and the linked items that could go too).
 */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  const input = await body(
    req,
    z
      .object({
        items: z
          .array(z.object({ type: z.enum(WS_MOVABLE), id: z.uuid() }).strict())
          .min(1)
          .max(200),
        target: z.uuid(),
        withLinked: z.boolean().optional(),
        preview: z.boolean().optional(),
      })
      .strict(),
  );
  return json(await moveItems(auth, input));
});
