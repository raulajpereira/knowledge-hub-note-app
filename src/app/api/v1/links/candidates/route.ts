import { handler, json } from '@/server/http';
import { itemRef, requireContent } from '@/server/content/guard';
import { linkCandidates } from '@/server/content/notes';

export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  return json({ items: await linkCandidates(auth, ref, sp.get('q')?.trim().slice(0, 100) ?? '') });
});
