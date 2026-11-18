import { body, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { env } from '@/lib/env';
import { extAuth, receiveSnapshot, SnapshotZ } from '@/server/helpdesk';
import { extHandler } from '@/server/helpdesk/http';

/** POST /ext/v1/helpdesk/snapshot — "Ligar esta lista": the table as read; the app opens to set it up. */
export const POST = extHandler(async (req) => {
  const auth = await extAuth(req);
  if (!(await allow(`hd-snap:${auth.user.id}`, 60, 3600))) throw new ApiError(429, 'too_many_requests');
  const input = await body(req, SnapshotZ);
  const r = await receiveSnapshot(auth, input);
  return json(
    { ...r, setupUrl: `${env().APP_URL.replace(/\/$/, '')}/app/helpdesk?setup=${r.id}` },
    { status: 201 },
  );
});
