import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { setTemplate } from '@/server/budget';
import { MAX_TEMPLATE } from '@/server/budget/xlsx';
import { budgetAuth } from '@/server/budget/http';

/** POST /budgets/template (multipart: file = .xlsx) — the Excel model (replaces the previous one). */
export const POST = handler(async (req) => {
  const auth = await budgetAuth();
  if (!(await allow(`budget-tpl:${auth.user.id}`, 30, 3600))) throw new ApiError(429, 'too_many_requests');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_TEMPLATE + 64 * 1024)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_TEMPLATE });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'invalid_input');
  }
  const file = form.get('file');
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) throw new ApiError(400, 'template_not_xlsx');
  const settings = await setTemplate(auth, file.name, new Uint8Array(await file.arrayBuffer()));
  return json({ settings }, { status: 201 });
});
