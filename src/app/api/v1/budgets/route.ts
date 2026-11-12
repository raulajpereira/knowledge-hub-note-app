import { body, handler, json } from '@/server/http';
import { BudgetCreate, createBudget, listBudgets } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** GET /budgets — the person's budgets (newest first). */
export const GET = handler(async () => {
  const auth = await budgetAuth();
  return json({ budgets: await listBudgets(auth) });
});

/** POST /budgets — { client, scenario, modules }: the lines are made from the matrix. */
export const POST = handler(async (req) => {
  const input = await body(req, BudgetCreate);
  const auth = await budgetAuth();
  return json({ budget: await createBudget(auth, input) }, { status: 201 });
});
