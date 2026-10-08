import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { abortUpload, completeUpload } from '@/server/content/drive';

type Ctx = { params: Promise<{ id: string }> };

/** POST /drive/uploads/:id — every chunk sent: keep the file. */
export const POST = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('files');
  return json({ file: await completeUpload(auth, (await ctx.params).id) }, { status: 201 });
});

/** DELETE /drive/uploads/:id — cancel. */
export const DELETE = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('files');
  await abortUpload(auth, (await ctx.params).id);
  return json({ ok: true });
});
