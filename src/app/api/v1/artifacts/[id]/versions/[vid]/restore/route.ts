import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { restoreArtifactVersion } from '@/server/content/artifacts';

type Ctx = { params: Promise<{ id: string; vid: string }> };

/** POST /artifacts/:id/versions/:vid/restore — that version becomes current (as a new version). */
export const POST = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('artifacts');
  const p = await ctx.params;
  return json({ artifact: await restoreArtifactVersion(auth, z.uuid().parse(p.id), z.uuid().parse(p.vid)) });
});
