import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { listNotifications } from '@/server/notify/service';

/** GET /notifications?before=<iso>&limit=30 — newest first, plus the unread count (the bell polls this). */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const q = new URL(req.url).searchParams;
  const before = q.get('before') ? z.iso.datetime().parse(q.get('before')) : undefined;
  const limit = q.get('limit') ? z.coerce.number().int().min(1).max(100).parse(q.get('limit')) : undefined;
  const r = await listNotifications(auth, { before, limit });
  return json({ notifications: r.items, unreadCount: r.unread, hasMore: r.hasMore });
});
