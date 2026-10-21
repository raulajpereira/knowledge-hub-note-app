import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireAuth } from '@/server/auth/request';
import { checkInboundCode, setInboundCode } from '@/server/notify/service';

// "Email para a app": the person's own code (kh.entrada+<code>@…). Checks and
// saves share one budget of 30 a minute per person, so the check can't be
// used to list who has which address (it only says available / taken /
// invalid / reserved, never whose).
const PER_MIN = 30;
const limited = async (userId: string) => {
  if (!(await allow(`inbound-code:${userId}`, PER_MIN, 60))) throw new ApiError(429, 'too_many_requests');
};

/** GET /notifications/inbound/code?code=… — { status: available | taken | invalid | reserved } */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  await limited(auth.user.id);
  const code = new URL(req.url).searchParams.get('code') ?? '';
  return json({ status: await checkInboundCode(auth, code.slice(0, 64)) });
});

/** PUT /notifications/inbound/code { code } — 409 code_taken, 400 invalid_code / reserved_code */
export const PUT = handler(async (req) => {
  const auth = await requireAuth();
  await limited(auth.user.id);
  const { code } = await body(req, z.object({ code: z.string().max(64) }));
  return json({ settings: await setInboundCode(auth, code) });
});
