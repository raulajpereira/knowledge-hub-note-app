import 'server-only';
import type { NextRequest } from 'next/server';
import { currentRequest, errorResponse } from '@/server/http';
import { requireContent } from '@/server/content/guard';

/** The person in the app, with Helpdesk in their plan. */
export const helpdeskAuth = () => requireContent('helpdesk');

/**
 * The browser extension's routes (/api/ext/v1/…): signed with its own token
 * (Authorization: Bearer, scope 'ext'), never with the cookie — so there is
 * nothing for another site to forge and no origin to check.
 */
export function extHandler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await currentRequest.run({ method: req.method, path: req.nextUrl.pathname }, () => fn(req, ctx));
    } catch (err) {
      return errorResponse(err, `${req.method} ${req.nextUrl.pathname}`);
    }
  };
}
