import type { NextRequest, NextResponse } from 'next/server';
import { LANG_COOKIE, isLang, type Lang } from '@/i18n';
import { clientIp } from '@/server/http';
import { SESSION_COOKIE, cookieOptions } from './session';
import type { RequestMeta } from './service';

export function requestMeta(req: NextRequest, lang?: string): RequestMeta {
  const cookieLang = req.cookies.get(LANG_COOKIE)?.value;
  const l: Lang = isLang(lang) ? lang : isLang(cookieLang) ? cookieLang : 'pt';
  return { ip: clientIp(req), userAgent: req.headers.get('user-agent'), lang: l };
}

export function setSessionCookie(res: NextResponse, token: string, remember: boolean) {
  const opts = cookieOptions(remember);
  // Without "Lembrar-me" the cookie is a browser-session cookie (no maxAge);
  // the server-side expiry (12 h) still applies.
  res.cookies.set(SESSION_COOKIE, token, remember ? opts : { ...opts, maxAge: undefined });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(false), maxAge: 0 });
}
