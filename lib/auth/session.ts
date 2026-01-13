import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { userSessions } from '@/db/schema/user_sessions';
import { users } from '@/db/schema/users';
import { orgs } from '@/db/schema/orgs';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgRoles } from '@/db/schema/org_roles';
import { ok, err, type Result } from '@/lib/result';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './sessionConstants';

const SESSION_TOKEN_BYTES = 32;

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production';
}

export type SessionContext = {
  sessionId: string;
  user: { id: string; email: string; name: string | null };
  org: { id: string; name: string };
  membership: { id: string; roleId: string | null; crewMemberId: string | null };
  role: { id: string | null; key: string | null; name: string | null; capabilities: string[] };
  actor: {
    userId: string;
    orgId: string;
    crewMemberId: string | null;
    roleKey: string | null;
    capabilities: string[];
    isImpersonating: boolean;
  };
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === key) return rest.join('=') || null;
  }
  return null;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return parseCookieValue(req.headers.get('cookie'), SESSION_COOKIE_NAME);
}

function parseCapabilities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((c) => String(c));
  } catch {
    return [];
  }
  return [];
}

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

export function buildSessionCookie(token: string): string {
  const secure = shouldUseSecureCookie() ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = shouldUseSecureCookie() ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function createSession(params: {
  userId: string;
  orgId: string;
  impersonatedCrewMemberId?: string | null;
}): Promise<{ token: string; sessionId: string }> {
  const db = getDb();
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const [row] = await db
    .insert(userSessions)
    .values({
      userId: params.userId,
      orgId: params.orgId,
      tokenHash,
      impersonatedCrewMemberId: params.impersonatedCrewMemberId ?? null,
      expiresAt,
    })
    .returning({ id: userSessions.id });

  return { token, sessionId: row?.id ?? '' };
}

export async function revokeSession(token: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(token);
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.tokenHash, tokenHash));
}

export async function refreshSession(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const nextExpiry = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db
    .update(userSessions)
    .set({ lastSeenAt: now, expiresAt: nextExpiry })
    .where(eq(userSessions.id, sessionId));
}

export async function getSessionContext(req: Request): Promise<SessionContext | null> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      sessionId: userSessions.id,
      orgId: userSessions.orgId,
      userId: userSessions.userId,
      impersonatedCrewMemberId: userSessions.impersonatedCrewMemberId,
      sessionExpiresAt: userSessions.expiresAt,
      userEmail: users.email,
      userName: users.name,
      userStatus: users.status,
      orgName: orgs.name,
      membershipId: orgMemberships.id,
      membershipRoleId: orgMemberships.roleId,
      membershipCrewMemberId: orgMemberships.crewMemberId,
      membershipStatus: orgMemberships.status,
      roleKey: orgRoles.key,
      roleName: orgRoles.name,
      roleCapabilities: orgRoles.capabilities,
    })
    .from(userSessions)
    .leftJoin(users, eq(userSessions.userId, users.id))
    .leftJoin(orgs, eq(userSessions.orgId, orgs.id))
    .leftJoin(
      orgMemberships,
      and(eq(orgMemberships.userId, userSessions.userId), eq(orgMemberships.orgId, userSessions.orgId))
    )
    .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
    .where(
      and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now))
    )
    .limit(1);

  if (!row || !row.userId || !row.orgId || !row.userEmail || !row.orgName || !row.membershipId) {
    return null;
  }
  if (row.roleKey === 'warehouse') {
    return null;
  }
  if (row.userStatus && row.userStatus !== 'active') return null;
  if (row.membershipStatus && row.membershipStatus !== 'active') return null;
  if (row.sessionExpiresAt && new Date(row.sessionExpiresAt) <= now) return null;

  const capabilities = parseCapabilities(row.roleCapabilities);
  const crewMemberId = row.impersonatedCrewMemberId ?? row.membershipCrewMemberId ?? null;
  const isImpersonating = Boolean(row.impersonatedCrewMemberId);

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName ?? null,
    },
    org: {
      id: row.orgId,
      name: row.orgName,
    },
    membership: {
      id: row.membershipId,
      roleId: row.membershipRoleId ?? null,
      crewMemberId: row.membershipCrewMemberId ?? null,
    },
    role: {
      id: row.membershipRoleId ?? null,
      key: row.roleKey ?? null,
      name: row.roleName ?? null,
      capabilities,
    },
    actor: {
      userId: row.userId,
      orgId: row.orgId,
      crewMemberId,
      roleKey: row.roleKey ?? null,
      capabilities,
      isImpersonating,
    },
  };
}

export async function requireSession(req: Request): Promise<Result<SessionContext>> {
  const session = await getSessionContext(req);
  if (!session) return err('UNAUTHORIZED', 'Sign in required');
  return ok(session);
}
