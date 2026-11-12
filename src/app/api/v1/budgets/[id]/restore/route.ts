import { handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { deleteBudget } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** POST /budgets/:id/restore — "Anular" after deleting. */
export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await budgetAuth();
  await deleteBudget(auth, await idParam(ctx), true);
  return json({ ok: true });
});
