import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { mgOptions } from '@/server/content/mg';

/**
 * GET /mg/options — the tenant's projects and people, for the selects of
 * other screens (tasks, issues, transports). Read-only, any member.
 */
export const GET = handler(async () => json(await mgOptions(await requireAuth())));
