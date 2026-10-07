import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createSnippet, listSnippets } from '@/server/content/snippets';
import { DEV_LANG_IDS, DEV_TYPES } from '@/lib/devlib';

export const GET = handler(async () => {
  const auth = await requireContent('devlib');
  return json({ snippets: await listSnippets(auth) });
});

/** POST /snippets { title, type, lang } — prototype "Novo Snippet" (one empty file). */
export const POST = handler(async (req) => {
  const auth = await requireContent('devlib');
  const input = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(300),
      type: z.enum(DEV_TYPES),
      lang: z.enum(DEV_LANG_IDS),
    }),
  );
  return json({ snippet: await createSnippet(auth, input) }, { status: 201 });
});
