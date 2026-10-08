import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { listRequests } from '@/server/plans/requests';

/** GET /requests — Pedidos (plan and custom package requests made in the app). */
export const GET = handler(async () => {
  await requireAdmin('requests');
  return json({ requests: await listRequests() });
});
