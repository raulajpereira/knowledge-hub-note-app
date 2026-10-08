import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { overview } from '@/server/admin/clients';

/** GET /overview — MRR, ARR, KPIs and "Precisa de atenção". */
export const GET = handler(async () => {
  await requireAdmin('overview');
  return json(await overview());
});
