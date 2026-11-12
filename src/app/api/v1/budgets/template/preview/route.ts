import { handler, json } from '@/server/http';
import { templatePreview } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** GET /budgets/template/preview?sheet= — the model's first rows, for the mapping screen. */
export const GET = handler(async (req) => {
  const auth = await budgetAuth();
  const sheet = new URL(req.url).searchParams.get('sheet')?.slice(0, 100) || undefined;
  return json({ preview: await templatePreview(auth, sheet) });
});
