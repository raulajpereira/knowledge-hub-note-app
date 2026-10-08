import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { explainCode, organiseMeeting, testSteps } from '@/server/ai/actions';

const Action = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meeting'),
    title: z.string().max(300),
    participants: z.array(z.string().max(120)).max(100),
    topics: z.string().min(1).max(60_000),
  }),
  z.object({
    kind: z.literal('explain'),
    code: z.string().min(1).max(60_000),
    lang: z.string().max(40).optional(),
    name: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal('tests'),
    title: z.string().min(1).max(300),
    module: z.string().max(40).optional(),
    kind2: z.string().max(40).optional(),
    pre: z.string().max(10_000).optional(),
    existing: z.array(z.string().max(2000)).max(100),
  }),
]);

/** POST /ai/action { kind, … } — the assistant's actions in the pages. */
export const POST = handler(async (req) => {
  const auth = await requireContent('ai');
  if (!(await allow(`aiact:${auth.user.id}`, 30, 300))) throw new ApiError(429, 'too_many_requests');
  const a = await body(req, Action);
  if (a.kind === 'meeting') return json({ meeting: await organiseMeeting(auth, a) });
  if (a.kind === 'explain') return json({ text: await explainCode(auth, a) });
  return json({ steps: await testSteps(auth, { ...a, kind: a.kind2 }) });
});
