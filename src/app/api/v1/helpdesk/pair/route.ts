import { handler, json, clientIp } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { pairExtension } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/pair — a token for the browser extension (handed to it by the page, never shown). */
export const POST = handler(async (req) => {
  const auth = await helpdeskAuth();
  if (!(await allow(`hd-pair:${auth.user.id}`, 10, 3600))) throw new ApiError(429, 'too_many_requests');
  return json(await pairExtension(auth, { ip: clientIp(req) }), { status: 201 });
});
