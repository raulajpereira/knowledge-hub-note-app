import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { listClients } from '@/server/admin/clients';

/** GET /clients — every client (packs and individuals) with plan, seats in use and value; plus the plans. */
export const GET = handler(async () => {
  await requireAdmin('clients');
  const { clients, plans } = await listClients();
  return json({ clients, plans });
});
