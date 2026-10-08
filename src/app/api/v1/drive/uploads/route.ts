import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { startUpload } from '@/server/content/drive';
import { FILES_MAX_MB_CAP } from '@/lib/drive';

/** POST /drive/uploads { name, size, mime?, folderId?, sharedFolderId? } — opens a chunked upload. */
export const POST = handler(async (req) => {
  const auth = await requireContent('files');
  const input = await body(
    req,
    z.object({
      name: z.string().min(1).max(1000),
      size: z
        .number()
        .int()
        .min(0)
        .max(FILES_MAX_MB_CAP * 1024 * 1024),
      mime: z.string().max(200).optional(),
      folderId: z.uuid().nullable().optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json(await startUpload(auth, input), { status: 201 });
});
