import { z } from 'zod';
import { DEV_LANG_IDS, DEV_TYPES } from '@/lib/devlib';

// Shapes of what the Code Library sends.
export const SnippetFileSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(200),
  lang: z.enum(DEV_LANG_IDS),
  code: z.string().max(200_000),
});
export const SnippetPatch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  type: z.enum(DEV_TYPES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  fav: z.boolean().optional(),
  description: z.string().max(20_000).optional(),
  files: z
    .array(SnippetFileSchema)
    .min(1)
    .max(20)
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, { message: 'duplicate file id' })
    .optional(),
  related: z.array(z.uuid()).max(100).optional(),
});
