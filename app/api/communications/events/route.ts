import { desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageTemplates } from '@/lib/authz';
import { withCommOrgScope } from '@/lib/communications/scope';
import { commEvents } from '@/db/schema/comm_events';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageTemplates(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limitRaw = searchParams.get('limit');
  const limit = Math.max(1, Math.min(100, limitRaw ? Number(limitRaw) : 25));

  return await withCommOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (db) => {
    const rows = await db
      .select({
        id: commEvents.id,
        eventKey: commEvents.eventKey,
        entityType: commEvents.entityType,
        entityId: commEvents.entityId,
        createdAt: commEvents.createdAt,
      })
      .from(commEvents)
      .where(eq(commEvents.orgId, context.data.orgId))
      .orderBy(desc(commEvents.createdAt))
      .limit(limit);
    return ok(rows);
  });
});
