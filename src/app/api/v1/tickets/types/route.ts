import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createType, listTypes, orderTypes } from '@/server/content/tickets';
import { TypeName } from '../schemas';

/** GET /tickets/types — the caller's type list (started with the defaults) · POST adds one · PUT reorders. */
export const GET = handler(async () => {
  const auth = await requireContent('tickets');
  return json({ types: await listTypes(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('tickets');
  const { name } = await body(req, TypeName);
  return json({ type: await createType(auth, name) }, { status: 201 });
});

export const PUT = handler(async (req) => {
  const auth = await requireContent('tickets');
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).max(50) }));
  await orderTypes(auth, ids);
  return json({ types: await listTypes(auth) });
});
