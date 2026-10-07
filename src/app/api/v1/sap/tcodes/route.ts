import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createTcode, listTcodes } from '@/server/content/sap';
import { TcodeInput } from '../schemas';

export const GET = handler(async () => {
  const auth = await requireContent('tcodes');
  return json({ tcodes: await listTcodes(auth) });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('tcodes');
  return json({ tcode: await createTcode(auth, await body(req, TcodeInput)) }, { status: 201 });
});
