import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { plansFull } from '@/server/admin/plans';

/** GET /plans — Pacotes e Preços. */
export const GET = handler(async () => {
  await requireAdmin('plans');
  return json(await plansFull());
});
