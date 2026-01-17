import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { listOrgRoles } from '@/lib/queries/org_roles';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgInvites } from '@/db/schema/org_invites';
import { orgRoles } from '@/db/schema/org_roles';
import { crewMembers } from '@/db/schema/crew_members';
import { isRealEstateEdition } from '@/lib/appEdition';
import { users } from '@/db/schema/users';
import { userSessions } from '@/db/schema/user_sessions';

const inviteSchema = z
  .object({
    orgId: z.string().trim().min(1),
    inviteId: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    roleId: z.string().trim().optional(),
    roleKey: z.string().trim().optional(),
    crewMemberId: z.string().trim().nullable().optional(),
  })
  .refine((data) => Boolean(data.inviteId || data.email), {
    message: 'Invite id or email is required',
  });

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildInviteUrl(req: Request, token: string): string {
  const origin = new URL(req.url).origin;
  return `${origin}/signup?invite=${token}`;
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const isRealEstate = isRealEstateEdition();
  const db = getDb();

  const rolesResult = await listOrgRoles({ orgId: context.data.orgId });
  if (!rolesResult.ok) return rolesResult;

  const membershipRows = isRealEstate
    ? await db
        .select({
          membershipId: orgMemberships.id,
          userId: orgMemberships.userId,
          email: users.email,
          name: users.name,
          userStatus: users.status,
          userCreatedAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
          roleId: orgMemberships.roleId,
          roleKey: orgRoles.key,
          roleName: orgRoles.name,
          membershipStatus: orgMemberships.status,
          membershipCreatedAt: orgMemberships.createdAt,
        })
        .from(orgMemberships)
        .innerJoin(users, eq(orgMemberships.userId, users.id))
        .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
        .where(eq(orgMemberships.orgId, context.data.orgId))
        .orderBy(desc(orgMemberships.createdAt))
    : await db
        .select({
          membershipId: orgMemberships.id,
          userId: orgMemberships.userId,
          email: users.email,
          name: users.name,
          userStatus: users.status,
          userCreatedAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
          roleId: orgMemberships.roleId,
          roleKey: orgRoles.key,
          roleName: orgRoles.name,
          membershipStatus: orgMemberships.status,
          membershipCreatedAt: orgMemberships.createdAt,
          crewMemberId: orgMemberships.crewMemberId,
          crewDisplayName: crewMembers.displayName,
          crewRole: crewMembers.role,
          crewActive: crewMembers.active,
          crewEmail: crewMembers.email,
        })
        .from(orgMemberships)
        .innerJoin(users, eq(orgMemberships.userId, users.id))
        .leftJoin(orgRoles, eq(orgMemberships.roleId, orgRoles.id))
        .leftJoin(crewMembers, eq(orgMemberships.crewMemberId, crewMembers.id))
        .where(eq(orgMemberships.orgId, context.data.orgId))
        .orderBy(desc(orgMemberships.createdAt));

  const userIds = Array.from(new Set(membershipRows.map((row) => row.userId)));
  const start30 = new Date();
  start30.setDate(start30.getDate() - 30);

  const sessionRows = userIds.length
    ? await db
        .select({
          userId: userSessions.userId,
          totalSessions: sql<number>`count(*)`.mapWith(Number),
          sessions30d: sql<number>`sum(case when ${userSessions.lastSeenAt} >= ${start30} then 1 else 0 end)`.mapWith(
            Number
          ),
          lastSeenAt: sql<Date | null>`max(${userSessions.lastSeenAt})`,
        })
        .from(userSessions)
        .where(and(eq(userSessions.orgId, context.data.orgId), inArray(userSessions.userId, userIds)))
        .groupBy(userSessions.userId)
    : [];

  const sessionByUserId = new Map<
    string,
    { totalSessions: number; sessions30d: number; lastSeenAt: Date | null }
  >();
  sessionRows.forEach((row) =>
    sessionByUserId.set(String(row.userId), {
      totalSessions: Number(row.totalSessions ?? 0),
      sessions30d: Number(row.sessions30d ?? 0),
      lastSeenAt: (row.lastSeenAt as Date | null) ?? null,
    })
  );

  const members = membershipRows.map((row: any) => {
    const session = sessionByUserId.get(String(row.userId)) ?? {
      totalSessions: 0,
      sessions30d: 0,
      lastSeenAt: null,
    };
    return {
      membershipId: String(row.membershipId),
      userId: String(row.userId),
      email: String(row.email ?? ''),
      name: row.name ?? null,
      userStatus: String(row.userStatus ?? 'active'),
      userCreatedAt: row.userCreatedAt,
      lastLoginAt: row.lastLoginAt,
      roleId: row.roleId ? String(row.roleId) : null,
      roleKey: row.roleKey ? String(row.roleKey) : null,
      roleName: row.roleName ? String(row.roleName) : null,
      membershipStatus: String(row.membershipStatus ?? 'active'),
      membershipCreatedAt: row.membershipCreatedAt,
      crewMemberId: row.crewMemberId ? String(row.crewMemberId) : null,
      crewDisplayName: row.crewDisplayName ?? null,
      crewRole: row.crewRole ?? null,
      crewActive: typeof row.crewActive === 'boolean' ? row.crewActive : null,
      crewEmail: row.crewEmail ?? null,
      lastSeenAt: session.lastSeenAt,
      sessionsTotal: session.totalSessions,
      sessions30d: session.sessions30d,
    };
  });

  const inviteRows = isRealEstate
    ? await db
        .select({
          id: orgInvites.id,
          email: orgInvites.email,
          roleId: orgInvites.roleId,
          roleKey: orgRoles.key,
          roleName: orgRoles.name,
          status: orgInvites.status,
          createdAt: orgInvites.createdAt,
          expiresAt: orgInvites.expiresAt,
        })
        .from(orgInvites)
        .leftJoin(orgRoles, eq(orgInvites.roleId, orgRoles.id))
        .where(eq(orgInvites.orgId, context.data.orgId))
        .orderBy(desc(orgInvites.createdAt))
    : await db
        .select({
          id: orgInvites.id,
          email: orgInvites.email,
          roleId: orgInvites.roleId,
          roleKey: orgRoles.key,
          roleName: orgRoles.name,
          crewMemberId: orgInvites.crewMemberId,
          crewDisplayName: crewMembers.displayName,
          status: orgInvites.status,
          createdAt: orgInvites.createdAt,
          expiresAt: orgInvites.expiresAt,
        })
        .from(orgInvites)
        .leftJoin(orgRoles, eq(orgInvites.roleId, orgRoles.id))
        .leftJoin(crewMembers, eq(orgInvites.crewMemberId, crewMembers.id))
        .where(eq(orgInvites.orgId, context.data.orgId))
        .orderBy(desc(orgInvites.createdAt));

  const invites = inviteRows.map((row: any) => ({
    id: String(row.id),
    email: String(row.email ?? ''),
    roleId: row.roleId ? String(row.roleId) : null,
    roleKey: row.roleKey ? String(row.roleKey) : null,
    roleName: row.roleName ? String(row.roleName) : null,
    crewMemberId: row.crewMemberId ? String(row.crewMemberId) : null,
    crewDisplayName: row.crewDisplayName ?? null,
    status: String(row.status ?? 'pending'),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }));

  const crewWithoutAccounts = isRealEstate
    ? []
    : (await db
        .select({
          id: crewMembers.id,
          displayName: crewMembers.displayName,
          role: crewMembers.role,
          email: crewMembers.email,
          active: crewMembers.active,
        })
        .from(crewMembers)
        .leftJoin(orgMemberships, eq(crewMembers.id, orgMemberships.crewMemberId))
        .where(and(eq(crewMembers.orgId, context.data.orgId), isNull(orgMemberships.id)))
        .orderBy(asc(crewMembers.displayName))).map((row) => ({
          id: String(row.id),
          displayName: String(row.displayName ?? ''),
          role: String(row.role ?? ''),
          email: row.email ?? null,
          active: typeof row.active === 'boolean' ? row.active : false,
        }));

  const roles = rolesResult.data.map((role) => ({
    id: String(role.id),
    key: String(role.key),
    name: String(role.name),
    isDefault: Boolean(role.isDefault),
  }));

  return ok({
    members,
    invites,
    crewWithoutAccounts,
    roles,
  });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const isRealEstate = isRealEstateEdition();
  const { orgId, inviteId, email, roleId, roleKey, crewMemberId } = parsed.data;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const db = getDb();
  let resolvedEmail = email ? normalizeEmail(email) : '';
  let resolvedRoleId: string | null = roleId ?? null;
  let resolvedCrewMemberId: string | null = isRealEstate ? null : crewMemberId ?? null;

  let inviteRow:
    | {
        id: string;
        email: string;
        roleId: string | null;
        crewMemberId: string | null;
        status: string;
      }
    | null = null;

  if (inviteId) {
    const [row] = await db
      .select({
        id: orgInvites.id,
        email: orgInvites.email,
        roleId: orgInvites.roleId,
        crewMemberId: orgInvites.crewMemberId,
        status: orgInvites.status,
      })
      .from(orgInvites)
      .where(and(eq(orgInvites.orgId, context.data.orgId), eq(orgInvites.id, inviteId)))
      .limit(1);

    if (!row) return err('NOT_FOUND', 'Invite not found');
    inviteRow = {
      id: String(row.id),
      email: String(row.email ?? ''),
      roleId: row.roleId ? String(row.roleId) : null,
      crewMemberId: row.crewMemberId ? String(row.crewMemberId) : null,
      status: String(row.status ?? 'pending'),
    };
    resolvedEmail = normalizeEmail(inviteRow.email);
    resolvedRoleId = inviteRow.roleId;
    resolvedCrewMemberId = isRealEstate ? null : inviteRow.crewMemberId;
  }

  if (resolvedCrewMemberId && !isRealEstate) {
    const [crewRow] = await db
      .select({ id: crewMembers.id, email: crewMembers.email })
      .from(crewMembers)
      .where(and(eq(crewMembers.orgId, context.data.orgId), eq(crewMembers.id, resolvedCrewMemberId)))
      .limit(1);
    if (!crewRow) return err('NOT_FOUND', 'Crew member not found');
    if (!resolvedEmail && crewRow.email) {
      resolvedEmail = normalizeEmail(crewRow.email);
    }
  }

  if (!resolvedEmail) {
    return err('VALIDATION_ERROR', 'Email is required to send an invite');
  }

  if (!resolvedRoleId && roleKey) {
    const [roleRow] = await db
      .select({ id: orgRoles.id })
      .from(orgRoles)
      .where(and(eq(orgRoles.orgId, context.data.orgId), eq(orgRoles.key, roleKey)))
      .limit(1);
    resolvedRoleId = roleRow?.id ?? null;
  }

  if (!resolvedRoleId) {
    const [defaultRole] = await db
      .select({ id: orgRoles.id })
      .from(orgRoles)
      .where(and(eq(orgRoles.orgId, context.data.orgId), eq(orgRoles.isDefault, true)))
      .limit(1);
    resolvedRoleId = defaultRole?.id ?? null;
  }

  if (!resolvedRoleId) {
    return err('VALIDATION_ERROR', 'Role is required to send an invite');
  }

  const [existingMembership] = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(eq(orgMemberships.orgId, context.data.orgId), eq(users.email, resolvedEmail)))
    .limit(1);

  if (existingMembership) {
    return err('CONFLICT', 'This user already has access to the org');
  }

  const token = randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 7);

  let inviteIdToUse = inviteRow?.id ?? null;
  if (!inviteIdToUse) {
    const [pendingInvite] = await db
      .select({ id: orgInvites.id })
      .from(orgInvites)
      .where(
        and(
          eq(orgInvites.orgId, context.data.orgId),
          eq(orgInvites.email, resolvedEmail),
          eq(orgInvites.status, 'pending')
        )
      )
      .limit(1);
    inviteIdToUse = pendingInvite?.id ?? null;
  }

  if (inviteIdToUse) {
    await db
      .update(orgInvites)
      .set({
        email: resolvedEmail,
        roleId: resolvedRoleId,
        crewMemberId: resolvedCrewMemberId,
        tokenHash,
        expiresAt,
        status: 'pending',
        createdByUserId: context.data.actor.userId,
        updatedAt: now,
      })
      .where(and(eq(orgInvites.orgId, context.data.orgId), eq(orgInvites.id, inviteIdToUse)));
  } else {
    const [inserted] = await db
      .insert(orgInvites)
      .values({
        orgId: context.data.orgId,
        email: resolvedEmail,
        roleId: resolvedRoleId,
        crewMemberId: resolvedCrewMemberId,
        tokenHash,
        expiresAt,
        status: 'pending',
        createdByUserId: context.data.actor.userId,
      })
      .returning({ id: orgInvites.id });
    inviteIdToUse = inserted?.id ?? null;
  }

  const inviteUrl = buildInviteUrl(req, token);

  return ok({
    inviteId: inviteIdToUse,
    inviteUrl,
    email: resolvedEmail,
    expiresAt,
  });
});
