import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { regenerateInboundToken } from '@/server/notify/service';

/** POST /notifications/inbound — a new inbound address (the old one stops working). */
export const POST = handler(async () => {
  const auth = await requireAuth();
  return json({ settings: await regenerateInboundToken(auth) });
});
