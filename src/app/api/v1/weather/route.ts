import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { weather } from '@/server/weather';

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

/** GET /weather?lat=&lon= — MET Norway forecast (+ IPMA warnings in Portugal) through our server, cached. */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  if (!(await allow(`wx:${auth.user.id}`, 60, 600))) throw new ApiError(429, 'too_many_requests');
  const q = Q.parse(Object.fromEntries(req.nextUrl.searchParams));
  return json(await weather(q.lat, q.lon));
});
