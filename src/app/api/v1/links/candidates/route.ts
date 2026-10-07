import { handler, json } from '@/server/http';
import { itemRef, LINK_TYPES, moduleOfType, requireContent } from '@/server/content/guard';
import { getEntitlements } from '@/server/licensing/entitlements';
import { linkCandidates } from '@/server/content/notes';

// GET /links/candidates?type=&id=&q=[&kind=tr]
// kind=tr: transports only ("Ordens de Transporte"); otherwise every other type.
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  const auth = await requireContent(moduleOfType(ref.type));
  // Only item types whose module is in the plan can be offered.
  const { modules } = await getEntitlements(auth.tenant.id);
  const tr = sp.get('kind') === 'tr';
  const types = LINK_TYPES.filter((t) => (t === 'transport') === tr && modules.includes(moduleOfType(t)));
  return json({
    items: await linkCandidates(auth, ref, sp.get('q')?.trim().slice(0, 100) ?? '', [...types]),
  });
});
