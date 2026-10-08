import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { requireModule } from '@/server/licensing/entitlements';
import { createLink, linkFor, listLinks } from '@/server/share/links';

const Item = z.object({ itemType: z.enum(['note', 'artifact', 'file']), itemId: z.uuid() }).strict();
const mod = (t: 'note' | 'artifact' | 'file') => ({ note: 'notes', artifact: 'artifacts', file: 'files' })[t];

/** GET /share/links — the caller's active public links; ?type=note|artifact|file&id= — the link of one item (or null). */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  if (sp.has('type')) {
    const { itemType, itemId } = Item.parse({ itemType: sp.get('type'), itemId: sp.get('id') });
    const auth = await requireContent(mod(itemType));
    return json({ link: await linkFor(auth, itemType, itemId) });
  }
  const auth = await requireContent('share');
  return json({ links: await listLinks(auth) });
});

/** POST /share/links {itemType, itemId} — turns the item's public link on. */
export const POST = handler(async (req) => {
  const { itemType, itemId } = await body(req, Item);
  const auth = await requireContent(mod(itemType));
  await requireModule(auth.tenant.id, 'share');
  return json({ link: await createLink(auth, itemType, itemId) }, { status: 201 });
});
