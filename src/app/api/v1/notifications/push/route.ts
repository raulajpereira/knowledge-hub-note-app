import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { allow } from '@/server/auth/rateLimit';
import { ApiError } from '@/server/errors';
import { listDevices, pushPublicKey, sendTest, subscribe, unsubscribe } from '@/server/notify/push';

// Web Push (Definições › Notificações › "Neste dispositivo"):
// GET    → { key: VAPID public key | null (feature off), devices }
// POST   → { endpoint, keys: { p256dh, auth }, device }  turn on in this browser
// DELETE → { endpoint } or { id }                       turn off (this browser / a device of the list)
// POST ?test=1                                          one test message to every device

export const GET = handler(async () => {
  const auth = await requireAuth();
  const key = pushPublicKey();
  return json({ key, devices: key ? await listDevices(auth) : [] });
});

export const POST = handler(async (req) => {
  const auth = await requireAuth();
  if (new URL(req.url).searchParams.get('test')) {
    if (!(await allow(`push-test:${auth.user.id}`, 10, 3600)))
      throw new ApiError(429, 'rate_limited', 'Too many tests');
    return json(await sendTest(auth, auth.user.lang));
  }
  const b = await body(
    req,
    z.object({
      endpoint: z.url().max(1000),
      keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
      device: z.string().max(120).default(''),
    }),
  );
  const id = await subscribe(auth, {
    endpoint: b.endpoint,
    p256dh: b.keys.p256dh,
    auth: b.keys.auth,
    device: b.device,
  });
  return json({ id });
});

export const DELETE = handler(async (req) => {
  const auth = await requireAuth();
  const b = await body(req, z.object({ endpoint: z.url().max(1000).optional(), id: z.uuid().optional() }));
  await unsubscribe(auth, b);
  return json({ ok: true });
});
