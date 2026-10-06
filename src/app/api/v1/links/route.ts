import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { itemRef, requireContent } from '@/server/content/guard';
import { linkItems, linksOf, unlinkItems } from '@/server/content/notes';

// "Ligações" between items. GET /links?type=note&id=  ·  POST|DELETE { a, b }
export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  return json({ links: await linksOf(auth, ref) });
});

const pair = z.object({ a: itemRef, b: itemRef });

export const POST = handler(async (req) => {
  const auth = await requireContent('notes');
  const { a, b } = await body(req, pair);
  await linkItems(auth, a, b);
  return json({ ok: true }, { status: 201 });
});

export const DELETE = handler(async (req) => {
  const auth = await requireContent('notes');
  const { a, b } = await body(req, pair);
  await unlinkItems(auth, a, b);
  return json({ ok: true });
});
