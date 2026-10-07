import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { boardItems } from '@/server/content/whiteboards';
import { linkTypes } from '../types';

/** GET /whiteboards/items?q=&type= — app items for "Adicionar elemento da app". */
export const GET = handler(async (req) => {
  const auth = await requireContent('whiteboard');
  const sp = new URL(req.url).searchParams;
  const all = await linkTypes(auth.tenant.id);
  const type = sp.get('type');
  const types = type && type !== 'all' ? all.filter((t) => t === type) : all;
  return json({
    types: all,
    items: await boardItems(auth, sp.get('q')?.trim().slice(0, 100) ?? '', types),
  });
});
