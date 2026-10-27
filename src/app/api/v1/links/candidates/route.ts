import { handler, json } from '@/server/http';
import { itemRef, LINK_TYPES, moduleOfType, requireContent } from '@/server/content/guard';
import { getEntitlements } from '@/server/licensing/entitlements';
import { linkCandidates } from '@/server/content/notes';

// GET /links/candidates?type=&id=&q=[&kind=tr|file]
// kind=tr: transports only ("Ordens de Transporte"); kind=file: the caller's
// files ("Ficheiros"); otherwise every other type.
const groupOf = (t: (typeof LINK_TYPES)[number]) => (t === 'transport' ? 'tr' : t === 'file' ? 'file' : '');
/** From a file ("Ligado a"): the items whose pages show their linked files. */
const FILE_SIDE = ['note', 'task', 'meeting'];

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const ref = itemRef.parse({ type: sp.get('type'), id: sp.get('id') });
  const auth = await requireContent(moduleOfType(ref.type));
  // Only item types whose module is in the plan can be offered.
  const { modules } = await getEntitlements(auth.tenant.id);
  const kind = sp.get('kind');
  const group = kind === 'tr' || kind === 'file' ? kind : '';
  const types = LINK_TYPES.filter(
    (t) =>
      groupOf(t) === group &&
      modules.includes(moduleOfType(t)) &&
      (ref.type !== 'file' || group || FILE_SIDE.includes(t)),
  );
  return json({
    items: await linkCandidates(auth, ref, sp.get('q')?.trim().slice(0, 100) ?? '', [...types]),
  });
});
