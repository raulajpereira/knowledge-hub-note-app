import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { suggestPeople } from '@/server/share/folders';

/** GET /share/suggest?q= — colleagues and Management people while typing an email. */
export const GET = handler(async (req) => {
  const auth = await requireContent('share');
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 80);
  return json({ people: await suggestPeople(auth, q) });
});
