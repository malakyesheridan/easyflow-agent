import { asc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { orgMemberships } from '@/db/schema/org_memberships';
import { users } from '@/db/schema/users';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const db = getDb();
  const rows = await db
    .select({
      userId: orgMemberships.userId,
      name: users.name,
      email: users.email,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.orgId, context.data.orgId))
    .orderBy(asc(users.name));

  return ok(
    rows.map((row) => ({
      id: String(row.userId),
      name: row.name ?? null,
      email: row.email ?? null,
    }))
  );
});
