import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { chatMessages, deleteChat } from '@/server/ai/chats';

/** GET /ai/chats/:id — the messages of a conversation. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('ai');
  return json({ messages: await chatMessages(auth, await idParam(ctx)) });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('ai');
  await deleteChat(auth, await idParam(ctx));
  return json({ ok: true });
});
