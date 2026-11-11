import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { listReports } from '@/server/support';

/** GET /support — the problems reported from the app (shown in Pedidos). */
export const GET = handler(async () => {
  await requireAdmin('requests');
  return json({ reports: await listReports() });
});
