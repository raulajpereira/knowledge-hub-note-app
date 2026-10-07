import { handler, json } from '@/server/http';
import { itemRef, moduleOfType, requireContent } from '@/server/content/guard';
import { getEntitlements } from '@/server/licensing/entitlements';
import { linkCandidates, type LinkType } from '@/server/content/notes';

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  const auth = await requireContent(moduleOfType(ref.type));
  // Only item types whose module is in the plan can be offered.
  const { modules } = await getEntitlements(auth.tenant.id);
  const types = (['note', 'task', 'voice', 'issue'] as LinkType[]).filter((t) =>
    modules.includes(moduleOfType(t)),
  );
  return json({ items: await linkCandidates(auth, ref, sp.get('q')?.trim().slice(0, 100) ?? '', types) });
});
