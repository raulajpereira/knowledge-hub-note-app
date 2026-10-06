import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { createVoice, listVoice, MAX_AUDIO } from '@/server/content/voice';
import { VOICE_KINDS } from '@/db/schema';

// GET /voice · POST /voice (multipart: audio = recording, meta = JSON { title, kind, durationMs, levels })
export const GET = handler(async () => {
  const auth = await requireContent('voice');
  return json({ voice: await listVoice(auth) });
});

const Meta = z.object({
  title: z.string().trim().max(300),
  kind: z.enum(VOICE_KINDS),
  durationMs: z.number().int().min(0),
  levels: z.array(z.number()).max(72),
});

export const POST = handler(async (req) => {
  const auth = await requireContent('voice');
  if (!(await allow(`voice:${auth.user.id}`, 30, 600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_AUDIO + 64 * 1024)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_AUDIO });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'invalid_input');
  }
  const audio = form.get('audio');
  const metaRaw = form.get('meta');
  if (!(audio instanceof Blob) || typeof metaRaw !== 'string') throw new ApiError(400, 'invalid_input');
  let meta: z.infer<typeof Meta>;
  try {
    meta = Meta.parse(JSON.parse(metaRaw));
  } catch {
    throw new ApiError(400, 'invalid_input');
  }
  const voice = await createVoice(auth, { ...meta, data: new Uint8Array(await audio.arrayBuffer()) });
  return json({ voice }, { status: 201 });
});
