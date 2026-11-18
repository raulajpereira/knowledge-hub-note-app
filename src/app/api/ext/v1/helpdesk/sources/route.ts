import { json } from '@/server/http';
import { extAuth, extSources } from '@/server/helpdesk';
import { extHandler } from '@/server/helpdesk/http';

/** GET /ext/v1/helpdesk/sources — the pages the extension reads, and how often. */
export const GET = extHandler(async (req) => {
  const auth = await extAuth(req);
  return json({ sources: await extSources(auth) });
});
