import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { pricingFor } from '@/server/plans/requests';

/** GET /plans — the Pricing window: plans, custom package prices, the current plan and pending requests. */
export const GET = handler(async () => json(await pricingFor(await requireAuth())));
