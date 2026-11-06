import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { contentCounts } from '@/server/content/notes';
import { entitlementsFor } from '@/server/workspaces';

/** GET /me/counts — sidebar badges, only for modules in the plan. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await entitlementsFor(auth);
  return json({ counts: await contentCounts(auth, new Set(modules)) });
});
