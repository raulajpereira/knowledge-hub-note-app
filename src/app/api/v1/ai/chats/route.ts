import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listChats } from '@/server/ai/chats';

/** GET /ai/chats — the caller's conversations, latest first. */
export const GET = handler(async () => {
  const auth = await requireContent('ai');
  return json({ chats: await listChats(auth) });
});
