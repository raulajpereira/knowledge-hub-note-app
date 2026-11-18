import { handler, json } from '@/server/http';
import { overview } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** GET /helpdesk — the linked pages, their tickets and the latest changes. */
export const GET = handler(async () => {
  const auth = await helpdeskAuth();
  return json(await overview(auth));
});
