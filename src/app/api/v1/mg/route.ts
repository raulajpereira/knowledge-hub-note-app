import { handler, json } from '@/server/http';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { loadMg } from '@/server/content/mg';

/** GET /mg — the tenant's Management data (clients, teams, people, projects, allocations, timesheets, requests, settings). */
export const GET = handler(async () => {
  const auth = await requireAnyContent(MG_MODULES);
  return json(await loadMg(auth));
});
