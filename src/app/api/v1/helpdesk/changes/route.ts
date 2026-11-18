import { handler, json } from '@/server/http';
import { unseenChanges } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** GET /helpdesk/changes — the changes not seen yet (the popup). */
export const GET = handler(async () => {
  const auth = await helpdeskAuth();
  return json({ changes: await unseenChanges(auth) });
});
