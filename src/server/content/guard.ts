import 'server-only';
import { z } from 'zod';
import { requireAuth } from '@/server/auth/request';
import { ApiError } from '@/server/errors';
import { entitlementsFor, requireModuleFor } from '@/server/workspaces';

/** Session + entitlement for a content module (API.md: every app route needs both). */
export async function requireContent(moduleId: string) {
  const auth = await requireAuth();
  await requireModuleFor(auth, moduleId);
  return auth;
}

/** Some module of a group (Management: any mg_* page gives access to its data). */
export async function requireAnyContent(moduleIds: readonly string[]) {
  const auth = await requireAuth();
  const { modules } = await entitlementsFor(auth);
  if (!moduleIds.some((m) => modules.includes(m)))
    throw new ApiError(403, 'module_not_included', undefined, { module: moduleIds[0] });
  return auth;
}
export const MG_MODULES = [
  'mg_overview',
  'mg_teams',
  'mg_people',
  'mg_skills',
  'mg_projects',
  'mg_dash',
  'mg_alloc',
  'mg_staff',
  'mg_time',
  'mg_clients',
] as const;

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
          'meeting',
          'file',
          'artifact',
          'snippet',
          'request',
          'board',
          'system',
          'tcode',
          'transport',
          'code',
          'fn',
          'sapnote',
          'ticket',
        ]),
        id: z.uuid(),
      }),
    )
    .max(500),
});
export const LINK_TYPES = [
  'note',
  'task',
  'voice',
  'issue',
  'meeting',
  'file',
  'artifact',
  'code',
  'transport',
  'sapnote',
  'ticket',
] as const;
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
    meeting: 'meetings',
    file: 'files',
    artifact: 'artifacts',
    code: 'codelib',
    transport: 'transports',
    sapnote: 'sapnotes',
    ticket: 'tickets',
  })[type];
