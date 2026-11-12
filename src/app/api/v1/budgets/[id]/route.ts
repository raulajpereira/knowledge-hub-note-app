import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { BudgetPatch, deleteBudget, getBudget, updateBudget } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** GET /budgets/:id */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await budgetAuth();
  return json({ budget: await getBudget(auth, await idParam(ctx)) });
});

/** PATCH /budgets/:id — { client?, scenario?, rebuild?, lines? } */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const input = await body(req, BudgetPatch);
  const auth = await budgetAuth();
  return json({ budget: await updateBudget(auth, await idParam(ctx), input) });
});

/** DELETE /budgets/:id — marked deleted (POST /restore takes it back). */
export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await budgetAuth();
  await deleteBudget(auth, await idParam(ctx));
  return json({ ok: true });
});
