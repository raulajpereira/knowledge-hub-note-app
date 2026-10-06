import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addNoteImage, importNoteImage } from '@/server/content/notes';

const MAX = 5 * 1024 * 1024;

/**
 * POST /notes/:id/attachments — raw image body, or JSON { url } to import an
 * image from the web (fetched by the server). Stored in the private bucket and
 * streamed back by /files/:id; the document keeps `/api/v1/files/<id>`.
 */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('notes');
  const noteId = await idParam(ctx);
  if (!(await allow(`note-img:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  let id: string;
  if (req.headers.get('content-type')?.startsWith('application/json')) {
    const { url } = await body(req, z.object({ url: z.url({ protocol: /^https?$/ }).max(2048) }));
    id = await importNoteImage(auth, noteId, url);
  } else {
    if (Number(req.headers.get('content-length') ?? 0) > MAX)
      throw new ApiError(413, 'file_too_large', undefined, { max: MAX });
    id = await addNoteImage(auth, noteId, new Uint8Array(await req.arrayBuffer()));
  }
  return json({ id, src: `/api/v1/files/${id}` }, { status: 201 });
});
