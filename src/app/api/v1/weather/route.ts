import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { forecast } from '@/server/weather';

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

/** GET /weather?lat=&lon= — Open-Meteo forecast through our server (cached 30 min). */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  if (!(await allow(`wx:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  const q = Q.parse(Object.fromEntries(req.nextUrl.searchParams));
  return json(await forecast(q.lat, q.lon));
});
