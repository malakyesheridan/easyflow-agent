import { err, ok } from '@/lib/result';
import { jsonResult } from '@/lib/api-response';
import { buildSessionCookie, getSessionContext, getSessionTokenFromRequest, refreshSession } from '@/lib/auth/session';

export async function GET(req: Request): Promise<Response> {
  try {
    const session = await getSessionContext(req);
    if (!session) return jsonResult(err('UNAUTHORIZED', 'Sign in required'));

    const token = getSessionTokenFromRequest(req);
    if (token) {
      await refreshSession(session.sessionId);
    }

    const response = jsonResult(
      ok({
        user: session.user,
        org: session.org,
        role: session.role,
        actor: session.actor,
        membership: session.membership,
      })
    );

    if (token) {
      response.headers.set('Set-Cookie', buildSessionCookie(token));
    }

    return response;
  } catch (error) {
    return jsonResult(err('INTERNAL_ERROR', 'Failed to load session', error));
  }
}
