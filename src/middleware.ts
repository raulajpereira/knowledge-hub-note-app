import { NextResponse, type NextRequest } from 'next/server';

// Every page gets a Content-Security-Policy with a per-request nonce (Next
// adds it to its own scripts), and the app area without a session cookie
// goes to login (?next). The cookie is validated for real on the server by
// every page and API call. API routes set their own headers.

const dev = process.env.NODE_ENV === 'development';

export function csp(nonce: string) {
  return [
    "default-src 'self'",
    // hash-wasm (vault, Argon2id) compiles WebAssembly; dev needs eval for fast refresh
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
    // React style attributes in the server HTML
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Cloudflare Turnstile (only loaded when the login asks for it)
    "connect-src 'self' https://challenges.cloudflare.com",
    "media-src 'self' blob:",
    // artifacts are shown from their own sandboxed /view responses (opaque origin)
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if ((path === '/app' || path.startsWith('/app/')) && !req.cookies.get('kh_session')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

export const config = {
  matcher: [
    {
      // pages only: not the API, Next's static files or the icons/manifest
      source: '/((?!api/|_next/static|_next/image|favicon|icon|apple-icon|manifest).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
