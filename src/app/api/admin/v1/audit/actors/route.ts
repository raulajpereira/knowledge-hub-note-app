import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { auditActors } from '@/server/admin/audit';

/** GET /audit/actors — the "Quem" filter. */
export const GET = handler(async () => {
  await requireAdmin('audit');
  return json({ actors: await auditActors() });
});
