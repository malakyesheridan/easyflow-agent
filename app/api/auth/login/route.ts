import { eq, and, asc } from 'drizzle-orm';
import { jsonResult } from '@/lib/api-response';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { users } from '@/db/schema/users';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgRoles } from '@/db/schema/org_roles';
import { verifyPassword } from '@/lib/auth/passwords';
import { buildSessionCookie, createSession } from '@/lib/auth/session';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const orgId = body?.orgId ? String(body.orgId).trim() : '';

    if (!email || !password) {
      return jsonResult(err('VALIDATION_ERROR', 'Email and password are required'));
    }

    const clientId = getClientId(req);
    const rateLimitResult = rateLimit({
      req,
      key: 'auth:login',
      limit: 10,
      windowMs: 60_000,
      identifier: email ? `${clientId}:${email}` : clientId,
    });
    if (!rateLimitResult.ok) return jsonResult(rateLimitResult);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) {
      return jsonResult(err('UNAUTHORIZED', 'Invalid credentials'));
    }

    if (user.status !== 'active') {
      return jsonResult(err('FORBIDDEN', 'Account is disabled'));
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return jsonResult(err('UNAUTHORIZED', 'Invalid credentials'));
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const membershipQuery = orgId
      ? db
          .select()
          .from(orgMemberships)
          .where(and(eq(orgMemberships.userId, user.id), eq(orgMemberships.orgId, orgId)))
          .limit(1)
      : db
          .select()
          .from(orgMemberships)
          .where(eq(orgMemberships.userId, user.id))
          .orderBy(asc(orgMemberships.createdAt))
          .limit(1);

    const [membership] = await membershipQuery;
    if (!membership) {
      return jsonResult(err('FORBIDDEN', 'No organization access'));
    }
    if (membership.status !== 'active') {
      return jsonResult(err('FORBIDDEN', 'Membership is disabled'));
    }

    if (membership.roleId) {
      const [role] = await db
        .select({ key: orgRoles.key })
        .from(orgRoles)
        .where(and(eq(orgRoles.id, membership.roleId), eq(orgRoles.orgId, membership.orgId)))
        .limit(1);
      if (role?.key === 'warehouse') {
        return jsonResult(
          err('FORBIDDEN', 'Warehouse role is no longer supported. Ask an admin to assign a supported role.')
        );
      }
    }

    const { token, sessionId } = await createSession({
      userId: user.id,
      orgId: membership.orgId,
    });

    const response = jsonResult(
      ok({
        user: { id: user.id, email: user.email, name: user.name ?? null },
        orgId: membership.orgId,
        sessionId,
      })
    );
    void logAuditEvent({
      orgId: membership.orgId,
      actorUserId: user.id,
      actorType: 'user',
      action: 'LOGIN',
      entityType: 'auth',
      entityId: user.id,
      before: null,
      after: { sessionId },
      metadata: buildAuditMetadata(req),
    });
    response.headers.set('Set-Cookie', buildSessionCookie(token));
    return response;
  } catch (error) {
    return jsonResult(err('INTERNAL_ERROR', 'Failed to sign in', error));
  }
}
