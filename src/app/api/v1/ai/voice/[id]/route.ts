import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { meetingFromVoice, transcribeVoice } from '@/server/ai/actions';

/** POST /ai/voice/:id { action: 'transcribe' | 'meeting' } — transcript, or a meeting record from the note. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('ai');
  await requireContent('voice');
  if (!(await allow(`aivoice:${auth.user.id}`, 20, 600))) throw new ApiError(429, 'too_many_requests');
  const { action, folderId } = await body(
    req,
    z.object({ action: z.enum(['transcribe', 'meeting']), folderId: z.uuid().nullable().optional() }),
  );
  const id = await idParam(ctx);
  if (action === 'transcribe') return json({ transcript: await transcribeVoice(auth, id) });
  await requireContent('meetings');
  return json({ meeting: await meetingFromVoice(auth, id, folderId) });
});
