export function buildAuditMetadata(req: Request, extra?: Record<string, unknown>): Record<string, unknown> {
  let path = '';
  try {
    path = new URL(req.url).pathname;
  } catch {
    path = '';
  }

  const headers = req.headers;
  const forwardedFor = headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0]?.trim() : headers.get('x-real-ip');

  return {
    ip: ip || null,
    userAgent: headers.get('user-agent') || null,
    method: req.method,
    path,
    ...(extra ?? {}),
  };
}
