import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageClients } from '@/lib/authz';
import { listClients } from '@/lib/queries/clients';
import { createClient } from '@/lib/mutations/clients';

/**
 * GET /api/clients?orgId=...&q=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const query = searchParams.get('q');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageClients(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listClients({ orgId: context.data.orgId, query });
});

/**
 * POST /api/clients
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageClients(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await createClient({ ...body, orgId: context.data.orgId });
});
