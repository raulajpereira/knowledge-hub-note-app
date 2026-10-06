import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { homeData } from '@/server/content/home';

/** GET /home — data for the Início cards (tasks, recent and favourite notes). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await getEntitlements(auth.tenant.id);
  return json(await homeData(auth, new Set(modules)));
});
