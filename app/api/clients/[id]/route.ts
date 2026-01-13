import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageClients } from '@/lib/authz';
import { getClientById } from '@/lib/queries/clients';
import { updateClient } from '@/lib/mutations/clients';
import { getClientPerformance } from '@/lib/clients/clientPerformance';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/clients/:id?orgId=...
 */
export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageClients(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
    if (!id) return err('VALIDATION_ERROR', 'Client id is required');
    const clientResult = await getClientById({ orgId: context.data.orgId, clientId: id });
    if (!clientResult.ok) return clientResult;
    const performance = await getClientPerformance({
      orgId: context.data.orgId,
      clientId: id,
      actor: context.data.actor,
    });
    return ok({
      client: clientResult.data,
      performance: performance.ok ? performance.data : null,
    });
  });

  return handler(req);
}

/**
 * PATCH /api/clients/:id
 */
export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const body = await request.json();
    const orgId = body?.orgId ? String(body.orgId) : null;
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageClients(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
    const { id } = await params;
    if (!id) return err('VALIDATION_ERROR', 'id is required');
    return await updateClient({ ...body, orgId: context.data.orgId, id });
  });

  return handler(req);
}
