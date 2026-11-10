import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { getNoteVersion } from '@/server/content/noteVersions';
import { requireModuleFor } from '@/server/workspaces';

type Ctx = { params: Promise<{ id: string; vid: string }> };

/** GET /notes/:id/versions/:vid — one version (title + document) for the read-only preview. */
export const GET = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('notes');
  await requireModuleFor(auth, 'history');
  const p = await ctx.params;
  return json({ version: await getNoteVersion(auth, z.uuid().parse(p.id), z.uuid().parse(p.vid)) });
});
