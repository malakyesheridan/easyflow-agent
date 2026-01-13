import { jsonResult } from '@/lib/api-response';
import { ok } from '@/lib/result';
import { clearSessionCookie, getSessionTokenFromRequest, revokeSession, getSessionContext } from '@/lib/auth/session';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

export async function POST(req: Request): Promise<Response> {
  const session = await getSessionContext(req);
  const token = getSessionTokenFromRequest(req);
  if (token) {
    await revokeSession(token);
  }
  if (session) {
    void logAuditEvent({
      orgId: session.org.id,
      actorUserId: session.user.id,
      actorType: 'user',
      action: 'LOGOUT',
      entityType: 'auth',
      entityId: session.user.id,
      before: null,
      after: null,
      metadata: buildAuditMetadata(req),
    });
  }
  const response = jsonResult(ok({}));
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}
