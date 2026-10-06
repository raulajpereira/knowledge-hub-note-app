import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { importEmail, MAX_EMAIL_FILE } from '@/server/content/emails';

/** POST /emails/import (multipart: file = .msg | .eml, folderId?) — one file per request. */
export const POST = handler(async (req) => {
  const auth = await requireContent('emails');
  if (!(await allow(`emails:${auth.user.id}`, 120, 600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_EMAIL_FILE + 64 * 1024)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_EMAIL_FILE });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'invalid_input');
  }
  const file = form.get('file');
  const folder = form.get('folderId');
  if (!(file instanceof File)) throw new ApiError(400, 'invalid_input');
  const folderId = typeof folder === 'string' && folder ? z.uuid().parse(folder) : null;
  const email = await importEmail(auth, {
    fileName: file.name || 'email.eml',
    data: new Uint8Array(await file.arrayBuffer()),
    folderId,
  });
  return json({ email }, { status: 201 });
});
