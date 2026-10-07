import 'server-only';
import { z } from 'zod';
import { requireAuth } from '@/server/auth/request';
import { requireModule } from '@/server/licensing/entitlements';

/** Session + entitlement for a content module (API.md: every app route needs both). */
export async function requireContent(moduleId: string) {
  const auth = await requireAuth();
  await requireModule(auth.tenant.id, moduleId);
  return auth;
}

export const idParam = async (ctx: { params: Promise<{ id: string }> }) =>
  z.uuid().parse((await ctx.params).id);
export type IdCtx = { params: Promise<{ id: string }> };

export const copySuffix = z.object({ suffix: z.string().max(24).default(' (cópia)') });
export const trashItems = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum([
          'note',
          'folder',
          'task',
          'voice',
          'email',
          'issue',
          'artifact',
          'snippet',
          'request',
          'board',
          'system',
          'tcode',
          'transport',
          'code',
        ]),
        id: z.uuid(),
      }),
    )
    .max(500),
});
export const LINK_TYPES = ['note', 'task', 'voice', 'issue', 'artifact', 'code', 'transport'] as const;
export const itemRef = z.object({
  type: z.enum(LINK_TYPES),
  id: z.uuid(),
});
/** Module that owns an item type (links need the module of the item they start from). */
export const moduleOfType = (type: (typeof LINK_TYPES)[number]) =>
  ({
    note: 'notes',
    task: 'tasks',
    voice: 'voice',
    issue: 'issues',
    artifact: 'artifacts',
    code: 'codelib',
    transport: 'transports',
  })[type];
