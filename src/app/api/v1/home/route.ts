import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { homeData } from '@/server/content/home';
import { entitlementsFor } from '@/server/workspaces';

/** GET /home — data for the Início cards (tasks, recent and favourite notes). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await entitlementsFor(auth);
  return json(await homeData(auth, new Set(modules)));
});
