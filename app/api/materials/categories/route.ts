import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { materials } from '@/db/schema/materials';
import { eq } from 'drizzle-orm';
import { canManageWarehouse } from '@/lib/authz';

/**
 * GET /api/materials/categories
 * Query:
 * - orgId (required)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageWarehouse(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  try {
    const db = getDb();
    const rows = await db
      .select({ category: materials.category })
      .from(materials)
      .where(eq(materials.orgId, context.data.orgId));

    const categories = Array.from(
      new Set(
        rows
          .map((row) => (typeof row.category === 'string' ? row.category.trim() : ''))
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    return ok(categories);
  } catch (error) {
    console.error('Error listing material categories:', error);
    return err('INTERNAL_ERROR', 'Failed to list material categories', error);
  }
});
