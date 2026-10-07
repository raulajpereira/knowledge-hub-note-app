import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createObject, listObjects } from '@/server/content/codelib';
import { ObjectCreate } from '../schemas';

/** GET /sap/objects — the Code Library SAP of the tenant (full node trees: the list searches code). */
export const GET = handler(async () => {
  const auth = await requireContent('codelib');
  return json({ objects: await listObjects(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('codelib');
  return json({ object: await createObject(auth, await body(req, ObjectCreate)) }, { status: 201 });
});
