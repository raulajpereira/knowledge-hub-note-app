import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { extendCode } from '@/server/admin/codes';
import { pauseCode, restoreCode, resumeCode, revokeCode } from '@/server/licensing/codes';
import { CODE_RE } from '@/server/licensing/codeFormat';

type Ctx = { params: Promise<{ code: string; op: string }> };

/**
 * POST /codes/:code/{pause|resume|extend|revoke|restore}. Revoke cuts access at
 * once and keeps the data 30 days (restore within that window; D45).
 */
export const POST = handler(async (_req, ctx: Ctx) => {
  const a = await requireAdmin('codes', true);
  const p = await ctx.params;
  const code = z.string().regex(CODE_RE).parse(p.code);
  const op = z.enum(['pause', 'resume', 'extend', 'revoke', 'restore']).parse(p.op);
  if (op === 'extend') await extendCode(a, code);
  else
    await { pause: pauseCode, resume: resumeCode, revoke: revokeCode, restore: restoreCode }[op](
      code,
      a.user.id,
    );
  return json({ ok: true });
});
