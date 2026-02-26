import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/sessionConstants';
import { isAuthHardBlocked } from '@/lib/auth/hardBlock';

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
const AUTH_HARD_BLOCK_ALLOWED_PATHS = ['/login', '/forgot-password', '/reset-password', '/logout'];

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

  if (isAuthHardBlocked() && !AUTH_HARD_BLOCK_ALLOWED_PATHS.some((path) => pathname.startsWith(path))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('blocked', '1');
    return NextResponse.redirect(url);
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
