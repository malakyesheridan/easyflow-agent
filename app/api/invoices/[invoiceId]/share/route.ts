import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';
import { createInvoiceShareLink } from '@/lib/mutations/job_invoices';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

/**
 * POST /api/invoices/[invoiceId]/share
 * Generates a public invoice link for client delivery.
 */
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { invoiceId } = await params;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const orgId = typeof body?.orgId === 'string' ? body.orgId : null;
    const auth = await requireOrgContext(request, orgId);
    if (!auth.ok) return auth;
    if (!canManageJobs(auth.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    return await createInvoiceShareLink({
      orgId: auth.data.orgId,
      id: invoiceId,
      updatedBy: auth.data.actor.userId ?? null,
    });
  });

  return handler(req);
}
