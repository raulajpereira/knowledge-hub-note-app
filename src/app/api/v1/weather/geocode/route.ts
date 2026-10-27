import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { geocode } from '@/server/weather';

const Q = z.object({ q: z.string().trim().min(1).max(80), lang: z.enum(['pt', 'en']).default('pt') });

/** GET /weather/geocode?q=Porto — city name → up to 6 places (OpenStreetMap Nominatim, cached). */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  if (!(await allow(`geo:${auth.user.id}`, 30, 600))) throw new ApiError(429, 'too_many_requests');
  const q = Q.parse(Object.fromEntries(req.nextUrl.searchParams));
  const places = await geocode(q.q, q.lang);
  if (!places.length) throw new ApiError(404, 'city_not_found');
  return json({ places });
});
