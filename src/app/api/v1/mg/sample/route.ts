import { handler, json } from '@/server/http';
import { MG_MODULES, requireAnyContent } from '@/server/content/guard';
import { loadMg, resetMgSample } from '@/server/content/mg';

/** POST /mg/sample — "Repor Dados": replace the Management data with the prototype's sample. */
export const POST = handler(async () => {
  const auth = await requireAnyContent(MG_MODULES);
  await resetMgSample(auth);
  return json(await loadMg(auth));
});
