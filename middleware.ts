import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/sessionConstants';

const AUTH_FREE_PATHS = [
  '/login',
  '/signup',
  '/signin',
  '/logout',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/invite',
  '/auth',
];
const DISABLED_TRADE_PATHS = ['/jobs', '/crews', '/crew', '/warehouse', '/invoices', '/operations', '/clients'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  if (AUTH_FREE_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/database')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/database/, '/contacts');
    return NextResponse.redirect(url);
  }

  if (DISABLED_TRADE_PATHS.some((path) => pathname.startsWith(path))) {
    const url = req.nextUrl.clone();
    url.pathname = '/contacts';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
