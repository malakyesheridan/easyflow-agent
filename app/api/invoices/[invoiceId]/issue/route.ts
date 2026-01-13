import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { issueJobInvoice } from '@/lib/mutations/job_invoices';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

/**
 * POST /api/invoices/[invoiceId]/issue
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
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const invoiceResult = await getJobInvoiceById({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
    if (!invoiceResult.ok || !invoiceResult.data) return err('NOT_FOUND', 'Invoice not found');

    const jobResult = await getJobById(invoiceResult.data.jobId, context.data.orgId, context.data.actor);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) return access;

    const dueAt = typeof body?.dueAt === 'string' ? new Date(body.dueAt) : null;
    const dueAtValue = dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null;
    const issuedAtInput = typeof body?.issuedAt === 'string' ? new Date(body.issuedAt) : null;
    const issuedAt = issuedAtInput && !Number.isNaN(issuedAtInput.getTime()) ? issuedAtInput : null;

    return await issueJobInvoice({
      orgId: context.data.orgId,
      id: invoiceId,
      issuedAt,
      dueAt: dueAtValue,
      updatedBy: context.data.actor.userId ?? null,
    });
  });

  return handler(req);
}
