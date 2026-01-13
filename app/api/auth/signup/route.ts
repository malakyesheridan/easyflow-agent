import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { jsonResult } from '@/lib/api-response';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { users } from '@/db/schema/users';
import { orgs } from '@/db/schema/orgs';
import { orgRoles } from '@/db/schema/org_roles';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgSettings } from '@/db/schema/org_settings';
import { orgInvites } from '@/db/schema/org_invites';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';
import { buildSessionCookie, createSession } from '@/lib/auth/session';
import { seedCommDefaults } from '@/lib/communications/seed';
import { withCommOrgScope } from '@/lib/communications/scope';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  orgName: z.string().trim().min(1).optional(),
  inviteToken: z.string().trim().optional(),
});

const DEFAULT_ROLES = [
  {
    key: 'admin',
    name: 'Admin',
    capabilities: [
      'admin',
      'manage_org',
      'manage_roles',
      'manage_templates',
      'manage_announcements',
      'manage_staff',
      'manage_schedule',
      'manage_jobs',
    ],
    isDefault: false,
  },
  {
    key: 'manager',
    name: 'Manager',
    capabilities: ['manage_templates', 'manage_announcements', 'manage_staff', 'manage_schedule', 'manage_jobs'],
    isDefault: false,
  },
  {
    key: 'staff',
    name: 'Staff',
    capabilities: ['view_schedule', 'view_jobs', 'update_jobs'],
    isDefault: true,
  },
];


function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function fail(code: string, message: string): never {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  throw error;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload'));
    }

    const { name, email, password, orgName, inviteToken } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    if (!inviteToken && !orgName) {
      return jsonResult(err('VALIDATION_ERROR', 'Organization name is required'));
    }

    const clientId = getClientId(req);
    const rateLimitResult = rateLimit({
      req,
      key: 'auth:signup',
      limit: 5,
      windowMs: 60_000,
      identifier: `${clientId}:${normalizedEmail}`,
    });
    if (!rateLimitResult.ok) return jsonResult(rateLimitResult);

    const db = getDb();
    let userId = '';
    let orgId = '';

    try {
      const result = await db.transaction(async (tx) => {
        const [existingUser] = await tx.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

        if (existingUser?.passwordHash) {
          if (!inviteToken || !verifyPassword(password, existingUser.passwordHash)) {
            fail('CONFLICT', 'An account with this email already exists. Please sign in.');
          }
        }
        if (existingUser?.status === 'disabled') {
          fail('FORBIDDEN', 'This account is disabled');
        }

        let roleId: string | null = null;
        let crewMemberId: string | null = null;

        if (inviteToken) {
          const tokenHash = hashToken(inviteToken);
          const now = new Date();
          const [invite] = await tx
            .update(orgInvites)
            .set({ status: 'accepted', updatedAt: now })
            .where(
              and(
                eq(orgInvites.tokenHash, tokenHash),
                eq(orgInvites.status, 'pending'),
                gt(orgInvites.expiresAt, now)
              )
            )
            .returning();

          if (!invite) {
            fail('INVALID_INVITE', 'Invite is invalid or expired');
          }

          const inviteEmail = invite.email.trim().toLowerCase();
          if (inviteEmail !== normalizedEmail) {
            fail('INVALID_INVITE', 'Invite email does not match');
          }

          orgId = invite.orgId;
          roleId = invite.roleId ?? null;
          crewMemberId = invite.crewMemberId ?? null;
        } else {
          const baseSlug = slugify(orgName || 'org');
          let slug = baseSlug || `org-${randomBytes(4).toString('hex')}`;
          const [slugMatch] = await tx.select().from(orgs).where(eq(orgs.slug, slug)).limit(1);
          if (slugMatch) {
            slug = `${slug}-${randomBytes(3).toString('hex')}`;
          }

          const [orgRow] = await tx
            .insert(orgs)
            .values({ name: orgName as string, slug })
            .returning({ id: orgs.id });
          orgId = orgRow?.id ?? '';

          if (!orgId) {
            fail('INTERNAL_ERROR', 'Failed to create organization');
          }

          await tx.insert(orgSettings).values({ orgId, companyName: orgName as string });

          const insertedRoles = await tx
            .insert(orgRoles)
            .values(
              DEFAULT_ROLES.map((role) => ({
                orgId,
                key: role.key,
                name: role.name,
                capabilities: JSON.stringify(role.capabilities),
                isDefault: role.isDefault,
              }))
            )
            .returning({ id: orgRoles.id, key: orgRoles.key });

          roleId = insertedRoles.find((role) => role.key === 'admin')?.id ?? null;

          // Job types and templates are defined during onboarding.
        }

        if (!orgId) {
          fail('INTERNAL_ERROR', 'Failed to resolve organization');
        }

        if (existingUser) {
          userId = existingUser.id;
          if (!existingUser.passwordHash) {
            await tx
              .update(users)
              .set({
                name: existingUser.name || name,
                passwordHash: hashPassword(password),
                status: 'active',
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingUser.id));
          }
        } else {
          const [newUser] = await tx
            .insert(users)
            .values({
              email: normalizedEmail,
              name,
              passwordHash: hashPassword(password),
              status: 'active',
            })
            .returning({ id: users.id });
          userId = newUser?.id ?? '';
        }

        if (!userId) {
          fail('INTERNAL_ERROR', 'Failed to create user');
        }

        const [existingMembership] = await tx
          .select()
          .from(orgMemberships)
          .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)))
          .limit(1);

        if (existingMembership) {
          fail('CONFLICT', 'This account already belongs to the organization.');
        }

        const [membership] = await tx
          .insert(orgMemberships)
          .values({
            orgId,
            userId,
            roleId,
            crewMemberId,
            status: 'active',
          })
          .returning({ id: orgMemberships.id });

        if (!membership?.id) {
          fail('INTERNAL_ERROR', 'Failed to create membership');
        }

        return { userId, orgId };
      });

      userId = result.userId;
      orgId = result.orgId;
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code) {
        return jsonResult(err((error as Error & { code?: string }).code || 'INTERNAL_ERROR', error.message));
      }
      throw error;
    }

    const { token, sessionId } = await createSession({ userId, orgId });

    await withCommOrgScope({ orgId, roleKey: 'system' }, async (tx) => {
      await seedCommDefaults(tx as any, orgId);
    });

    const response = jsonResult(
      ok({
        userId,
        orgId,
        sessionId,
      })
    );
    response.headers.set('Set-Cookie', buildSessionCookie(token));
    return response;
  } catch (error) {
    return jsonResult(err('INTERNAL_ERROR', 'Failed to sign up', error));
  }
}
