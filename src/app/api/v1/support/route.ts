import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { reportProblem, SupportInput } from '@/server/support';

/** POST /support { message, page, ua, version } — "Reportar problema". */
export const POST = handler(async (req) => {
  const input = await body(req, SupportInput);
  const auth = await requireAuth();
  return json(await reportProblem(auth, input), { status: 201 });
});
