import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { loadMg, resetMgSample } from '@/server/content/mg';

/** POST /mg/sample — "Repor Dados": replace the manager's Management data with the sample. */
export const POST = handler(async () => {
  const auth = await requireAnyContent(MG_MODULES);
  if (!(await allow(`mg-sample:${auth.user.id}`, 20, 3600))) throw new ApiError(429, 'too_many_requests');
  await resetMgSample(auth);
  return json(await loadMg(auth));
});
