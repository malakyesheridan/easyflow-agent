export function getBaseUrl(req?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const legacyUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (legacyUrl) return legacyUrl.replace(/\/$/, '');

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  if (req) {
    const proto = req.headers.get('x-forwarded-proto') || req.headers.get('x-forwarded-protocol');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      return `${proto || 'https'}://${host}`;
    }
    const origin = req.headers.get('origin');
    if (origin) return origin.replace(/\/$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  return '';
}
