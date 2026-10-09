import { z } from 'zod';
import { body, handler } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { aiConfig } from '@/server/ai/settings';
import { startTurn } from '@/server/ai/chats';
import { streamChat } from '@/server/ai/provider';

/**
 * POST /ai/chat { chatId?, message, today } — asks the assistant. The answer
 * streams as plain text; the chat id and the sources come in headers.
 */
export const POST = handler(async (req) => {
  const auth = await requireContent('ai');
  if (!(await allow(`aichat:${auth.user.id}`, 30, 300))) throw new ApiError(429, 'too_many_requests');
  const input = await body(
    req,
    z.object({
      chatId: z.uuid().optional(),
      message: z.string().trim().min(1).max(4000),
      today: z.iso.date(),
    }),
  );
  const cfg = await aiConfig(auth);
  const turn = await startTurn(auth, input);
  const it = streamChat(cfg, { system: turn.system, messages: turn.messages, maxTokens: 4096 });
  // the first chunk is awaited here, so a bad key or model is a normal JSON error
  // (and the conversation is left as it was)
  const first = await it.next().catch(async (e: unknown) => {
    await turn.fail();
    throw e;
  });
  let answer = first.done ? '' : first.value;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      if (answer) c.enqueue(enc.encode(answer));
    },
    async pull(c) {
      try {
        const n = await it.next();
        if (n.done) {
          await turn.finish(answer);
          c.close();
          return;
        }
        answer += n.value;
        c.enqueue(enc.encode(n.value));
      } catch {
        await turn.finish(`${answer}\n\n[…]`).catch(() => {});
        c.close();
      }
    },
    async cancel() {
      // the reader left: keep what arrived and close the provider's stream
      await turn.finish(answer).catch(() => {});
      await it.return(undefined).catch(() => {});
    },
  });
  if (first.done) await turn.finish(answer);
  return new Response(first.done ? enc.encode(answer) : stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Ai-Chat': turn.chatId,
      'X-Ai-Sources': encodeURIComponent(JSON.stringify(turn.sources)),
    },
  });
});
