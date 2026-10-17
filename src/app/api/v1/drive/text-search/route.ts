import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { fileIdsByText } from '@/server/search/status';

/** GET /drive/text-search?q= — ids of the files whose recognised text (OCR) contains q. */
export const GET = handler(async (req) => {
  const auth = await requireContent('files');
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 200) ?? '';
  return json({ ids: q.length >= 3 ? await fileIdsByText(auth, q) : [] });
});
