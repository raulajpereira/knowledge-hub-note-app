import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addEvidence, EVIDENCE_MAX } from '@/server/content/fnEvidence';
import { ROW_ID_RE } from '@/lib/functional';

const Q = z.object({ row: z.string().regex(ROW_ID_RE), name: z.string().max(400).default('') });

/**
 * POST /sap/functional/:id/evidence?row=<row id>&name=<file name> — raw body:
 * a screenshot or small file as evidence of one step of a test case.
 */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('fn_test');
  const id = await idParam(ctx);
  const sp = new URL(req.url).searchParams;
  const { row, name } = Q.parse({ row: sp.get('row'), name: sp.get('name') ?? undefined });
  if (!(await allow(`fn-evidence:${auth.user.id}`, 120, 600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > EVIDENCE_MAX)
    throw new ApiError(413, 'file_too_large', undefined, { max: EVIDENCE_MAX });
  const ev = await addEvidence(auth, id, row, name, new Uint8Array(await req.arrayBuffer()));
  return json({ evidence: ev }, { status: 201 });
});
