import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireAuth } from '@/server/auth/request';
import { listClients } from '@/server/content/sap';
import { entitlementsFor } from '@/server/workspaces';

/** GET /sap/clients — the tenant's clients (for the Systems / Transports / Tickets pickers). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await entitlementsFor(auth);
  if (!['systems', 'transports', 'tickets', 'mg_clients', 'mg_projects'].some((m) => modules.includes(m)))
    throw new ApiError(403, 'module_not_included');
  return json({ clients: await listClients(auth) });
});
