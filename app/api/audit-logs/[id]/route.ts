import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getAuditLogById } from '@/lib/queries/audit_logs';
import { requireOrgContext } from '@/lib/auth/require';
import { canViewAuditLogs } from '@/lib/authz';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/audit-logs/:id?orgId=...
 */
export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canViewAuditLogs(context.data.actor)) {
      return err('FORBIDDEN', 'Insufficient permissions');
    }
    if (!id) return err('VALIDATION_ERROR', 'id is required');
    return await getAuditLogById({ orgId: context.data.orgId, id });
  });

  return handler(req);
}
