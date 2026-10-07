import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { listClients } from '@/server/content/sap';

/** GET /sap/clients — the tenant's clients (for the Systems / Transports pickers). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await getEntitlements(auth.tenant.id);
  if (!['systems', 'transports', 'mg_clients', 'mg_projects'].some((m) => modules.includes(m)))
    throw new ApiError(403, 'module_not_included');
  return json({ clients: await listClients(auth) });
});
