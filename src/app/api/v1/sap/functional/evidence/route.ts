import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listEvidence } from '@/server/content/fnEvidence';

/** GET /sap/functional/evidence?ids=<record ids, comma-separated> — evidence per test case and step. */
export const GET = handler(async (req) => {
  const auth = await requireContent('fn_test');
  const ids = z
    .array(z.uuid())
    .max(500)
    .parse((new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean));
  return json({ evidence: await listEvidence(auth, ids) });
});
