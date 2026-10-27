import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { reverseGeocode } from '@/server/weather';

const Q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  lang: z.enum(['pt', 'en']).default('pt'),
});

/** GET /weather/reverse?lat=&lon= — the device's location → its town (Nominatim, cached); null if unknown. */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  if (!(await allow(`geo:${auth.user.id}`, 30, 600))) throw new ApiError(429, 'too_many_requests');
  const q = Q.parse(Object.fromEntries(req.nextUrl.searchParams));
  return json({ place: await reverseGeocode(q.lat, q.lon, q.lang) });
});
