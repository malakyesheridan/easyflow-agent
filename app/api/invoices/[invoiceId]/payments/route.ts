import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canAccessFinancials } from '@/lib/auth/routeAccess';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { listJobPayments } from '@/lib/queries/job_payments';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

/**
 * GET /api/invoices/[invoiceId]/payments
 */
export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { invoiceId } = await params;
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canAccessFinancials(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const invoiceResult = await getJobInvoiceById({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
    if (!invoiceResult.ok || !invoiceResult.data) return err('NOT_FOUND', 'Invoice not found');

    return await listJobPayments({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
  });

  return handler(req);
}
