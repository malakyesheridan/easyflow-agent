import { err, ok, type Result } from '@/lib/result';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitState = {
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitEntry>();
let lastSweep = 0;

function sweepExpired(now: number): void {
  if (now - lastSweep < 60_000) return;
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  lastSweep = now;
}

export function getClientId(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return 'unknown';
}

export function rateLimit(params: {
  req: Request;
  key: string;
  limit: number;
  windowMs: number;
  identifier?: string;
}): Result<RateLimitState> {
  const now = Date.now();
  sweepExpired(now);

  const baseId = params.identifier?.trim() || getClientId(params.req);
  const bucketKey = `${params.key}:${baseId}`;
  const entry = buckets.get(bucketKey);
  const resetAt = entry?.resetAt ?? now + params.windowMs;

  if (!entry || entry.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + params.windowMs });
    return ok({
      limit: params.limit,
      remaining: Math.max(0, params.limit - 1),
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    });
  }

  if (entry.count >= params.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return err('RATE_LIMITED', 'Too many requests', { retryAfterSeconds });
  }

  entry.count += 1;
  buckets.set(bucketKey, entry);

  return ok({
    limit: params.limit,
    remaining: Math.max(0, params.limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  });
}
