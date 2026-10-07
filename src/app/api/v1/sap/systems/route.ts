import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createSystem, listSystems } from '@/server/content/sap';
import { SystemInput } from '../schemas';

export const GET = handler(async () => {
  const auth = await requireContent('systems');
  return json({ systems: await listSystems(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('systems');
  const input = await body(req, SystemInput.required({ name: true }));
  return json({ system: await createSystem(auth, input) }, { status: 201 });
});
