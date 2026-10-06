import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { register } from '@/server/auth/service';
import { requestMeta } from '@/server/auth/route-utils';
import { MAX_PASSWORD } from '@/lib/passwordStrength';

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(1).max(MAX_PASSWORD),
  code: z.string().trim().min(1).max(20),
  lang: z.enum(['pt', 'en']).optional(),
});

export const POST = handler(async (req) => {
  const b = await body(req, Body);
  await register(b, requestMeta(req, b.lang));
  return json({ ok: true, verify: true }, { status: 201 });
});
