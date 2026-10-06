import { NextResponse, type NextRequest } from 'next/server';

// Edge gate for the app area: no session cookie → login (with ?next). The
// cookie is validated for real on the server by every page and API call.
export function middleware(req: NextRequest) {
  if (!req.cookies.get('kh_session')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*'] };
