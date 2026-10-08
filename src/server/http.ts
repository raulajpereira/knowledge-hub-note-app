import { AsyncLocalStorage } from 'node:async_hooks';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';

import { ApiError } from './errors';

export { ApiError };

// API conventions (API.md): JSON, errors as { error: { code, message } }.

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...init?.headers } });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return json(
      {
        error: {
          code: 'invalid_input',
          message: 'Invalid input',
          fields: err.issues.map((i) => i.path.join('.')),
        },
      },
      { status: 400 },
    );
  }
  console.error('[api] unhandled', err);
  return json({ error: { code: 'internal', message: 'Internal error' } }, { status: 500 });
}

/** Client IP as seen by the reverse proxy (Nginx / Caddy set X-Real-IP). */
export function clientIp(req: NextRequest): string | null {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

/**
 * CSRF defence for cookie-authenticated mutations: the browser always sends
 * Origin on cross-site POST/PUT/PATCH/DELETE; it must be our own origin.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin fetches from older browsers / server-to-server
  if (origin === new URL(env().APP_URL).origin) return;
  // Same host the browser is talking to (behind Nginx/Caddy: X-Forwarded-Host).
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // malformed Origin → reject below
  }
  if (!host || originHost !== host) throw new ApiError(403, 'bad_origin');
}

/** The request being handled (method and path), for checks deep in the call (suspended = read-only). */
export const currentRequest = new AsyncLocalStorage<{ method: string; path: string }>();

/** Wraps a route handler: origin check for mutations + uniform errors. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
      return await currentRequest.run({ method: req.method, path: req.nextUrl.pathname }, () => fn(req, ctx));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function body<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  return schema.parse(data);
}
