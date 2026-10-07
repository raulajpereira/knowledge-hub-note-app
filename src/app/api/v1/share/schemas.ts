import { z } from 'zod';

const name = z.string().trim().min(1).max(80);
export const ShareKindZ = z.enum(['notes', 'tasks', 'artifacts']);
export const FolderCreate = z
  .object({ kind: ShareKindZ, name, folderId: z.uuid().nullable().optional() })
  .strict();
export const FolderPatch = z.object({ name, paused: z.boolean() }).partial().strict();
export const MemberAdd = z
  .object({
    email: z.email().max(254),
    invite: z.boolean().optional(),
    perm: z.enum(['read', 'edit']).optional(),
  })
  .strict();
export const MemberPatch = z
  .object({ perm: z.enum(['read', 'edit']), paused: z.boolean() })
  .partial()
  .strict();
export const PersonPatch = z.object({ email: z.email().max(254), paused: z.boolean() }).strict();
/** module of each kind of shared folder */
export const KIND_MODULE = { notes: 'notes', tasks: 'tasks', artifacts: 'artifacts' } as const;
