import { handler } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { budgetXlsx } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** GET /budgets/:id/xlsx — the Excel model with the budget in its mapped cells. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await budgetAuth();
  const { file, report, name } = await budgetXlsx(auth, await idParam(ctx));
  return new Response(Buffer.from(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-KH-Inserted': JSON.stringify(report.inserted),
    },
  });
});
