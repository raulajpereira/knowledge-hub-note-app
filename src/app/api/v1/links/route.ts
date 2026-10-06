import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { itemRef, moduleOfType, requireContent } from '@/server/content/guard';
import { linkItems, linksOf, unlinkItems } from '@/server/content/notes';

// "Ligações" between items. GET /links?type=note|task&id=  ·  POST|DELETE { a, b }
// The caller needs the module of every item type involved.
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  const auth = await requireContent(moduleOfType(ref.type));
  return json({ links: await linksOf(auth, ref) });
});

const pair = z.object({ a: itemRef, b: itemRef });

async function authFor(a: z.infer<typeof itemRef>, b: z.infer<typeof itemRef>) {
  const auth = await requireContent(moduleOfType(a.type));
  if (b.type !== a.type) await requireContent(moduleOfType(b.type));
  return auth;
}

export const POST = handler(async (req) => {
  const { a, b } = await body(req, pair);
  await linkItems(await authFor(a, b), a, b);
  return json({ ok: true }, { status: 201 });
});

export const DELETE = handler(async (req) => {
  const { a, b } = await body(req, pair);
  await unlinkItems(await authFor(a, b), a, b);
  return json({ ok: true });
});
