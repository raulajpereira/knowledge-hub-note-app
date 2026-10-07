import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { createArtifact, listArtifactFolders, listArtifacts, MAX_HTML } from '@/server/content/artifacts';
import { reachableFolder } from '@/server/share/folders';

/** GET /artifacts — list (no HTML) and folders · ?shared=<folder> the artifacts of a shared folder. */
export const GET = handler(async (req) => {
  const auth = await requireContent('artifacts');
  const sh = new URL(req.url).searchParams.get('shared');
  if (sh) {
    const shared = await reachableFolder(auth, z.uuid().parse(sh));
    return json({
      artifacts: shared.kind === 'artifacts' ? await listArtifacts(auth, shared) : [],
      folders: [],
    });
  }
  const [artifacts, folders] = await Promise.all([listArtifacts(auth), listArtifactFolders(auth)]);
  return json({ artifacts, folders });
});

/** POST /artifacts { title, html?, folderId? } — new (blank) or imported .html file. */
export const POST = handler(async (req) => {
  const auth = await requireContent('artifacts');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_HTML * 2 + 4096)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_HTML });
  const input = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(300),
      html: z.string().max(MAX_HTML).optional(),
      folderId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ artifact: await createArtifact(auth, input) }, { status: 201 });
});
