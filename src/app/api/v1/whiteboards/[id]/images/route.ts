import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addBoardImage } from '@/server/content/whiteboards';

const MAX = 5 * 1024 * 1024;

/** POST /whiteboards/:id/images — raw image body (already scaled down by the browser). */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('whiteboard');
  const boardId = await idParam(ctx);
  if (!(await allow(`wb-img:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > MAX)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX });
  const id = await addBoardImage(auth, boardId, new Uint8Array(await req.arrayBuffer()));
  return json({ id }, { status: 201 });
});
