import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getSessionTokenFromRequest } from '@/lib/auth/session';
import { requireSession } from '@/lib/auth/session';
import { canImpersonate } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { userSessions } from '@/db/schema/user_sessions';
import { eq } from 'drizzle-orm';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';

export const POST = withRoute(async (req: Request) => {
  const sessionResult = await requireSession(req);
  if (!sessionResult.ok) return sessionResult;

  const clientId = getClientId(req);
  const rateLimitResult = rateLimit({
    req,
    key: 'auth:impersonate',
    limit: 30,
    windowMs: 60_000,
    identifier: `${clientId}:${sessionResult.data.actor.userId ?? 'unknown'}`,
  });
  if (!rateLimitResult.ok) return rateLimitResult;

  const body = await req.json();
  const crewMemberId = body?.crewMemberId ? String(body.crewMemberId) : null;
  const actor = sessionResult.data.actor;
  if (!canImpersonate(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const token = getSessionTokenFromRequest(req);
  if (!token) return err('UNAUTHORIZED', 'Sign in required');

  const db = getDb();
  await db
    .update(userSessions)
    .set({ impersonatedCrewMemberId: crewMemberId })
    .where(eq(userSessions.id, sessionResult.data.sessionId));

  return ok({ impersonatedCrewMemberId: crewMemberId });
});
