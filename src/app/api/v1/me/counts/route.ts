import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { contentCounts } from '@/server/content/notes';

/** GET /me/counts — sidebar badges, only for modules in the plan. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await getEntitlements(auth.tenant.id);
  return json({ counts: await contentCounts(auth, new Set(modules)) });
});
