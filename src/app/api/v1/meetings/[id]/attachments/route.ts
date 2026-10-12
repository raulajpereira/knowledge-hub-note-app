import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addMeetingImage, importMeetingImage } from '@/server/content/meetings';

const MAX = 5 * 1024 * 1024;

/**
 * POST /meetings/:id/attachments — an image for the topics: raw image body, or
 * JSON { url } to import one from the web (fetched by the server). Streamed
 * back by /meetings/files/:id; the document keeps `/api/v1/meetings/files/<id>`.
 */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('meetings');
  const meetingId = await idParam(ctx);
  if (!(await allow(`meeting-img:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  let id: string;
  if (req.headers.get('content-type')?.startsWith('application/json')) {
    const { url } = await body(req, z.object({ url: z.url({ protocol: /^https?$/ }).max(2048) }));
    id = await importMeetingImage(auth, meetingId, url);
  } else {
    if (Number(req.headers.get('content-length') ?? 0) > MAX)
      throw new ApiError(413, 'file_too_large', undefined, { max: MAX });
    id = await addMeetingImage(auth, meetingId, new Uint8Array(await req.arrayBuffer()));
  }
  return json({ id, src: `/api/v1/meetings/files/${id}` }, { status: 201 });
});
