import { handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { duplicateBudget } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** POST /budgets/:id/duplicate — a copy with the next reference. */
export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await budgetAuth();
  return json({ budget: await duplicateBudget(auth, await idParam(ctx)) }, { status: 201 });
});
