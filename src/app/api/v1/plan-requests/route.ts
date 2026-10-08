import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { createRequest } from '@/server/plans/requests';

const Req = z
  .object({
    kind: z.enum(['plan', 'custom']),
    plan: z.string().min(1).max(20).optional(),
    groups: z
      .array(z.enum(['base', 'pro', 'mgmt', 'dev', 'sap', 'feat', 'custom']))
      .max(7)
      .optional(),
    seats: z.number().int().min(1).max(999),
    cycle: z.enum(['monthly', 'annual']),
    notes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /plan-requests — "Pedir este plano / Pedir mudança para X" or a custom package (no billing). */
export const POST = handler(async (req) => {
  const auth = await requireAuth();
  return json({ id: await createRequest(auth, await body(req, Req)) }, { status: 201 });
});
