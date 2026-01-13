import { headers } from 'next/headers';
import InvoicePreviewDocument from '@/components/invoices/InvoicePreviewDocument';
import { Card, PageContainer } from '@/components/ui';
import { getSessionContext } from '@/lib/auth/session';
import { canManageJobs, type RequestActor } from '@/lib/authz';
import { getInvoiceDocumentData } from '@/lib/invoices/document';
import { formatCurrency, formatInvoiceDate, formatAddress } from '@/lib/invoices/format';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

interface InvoicePreviewPageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function resolveSession(searchParams: Record<string, string | string[] | undefined>): Promise<{
  orgId: string;
  actor: RequestActor | null;
}> {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  if (!cookie) return { orgId: '', actor: null };
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) return { orgId: '', actor: null };
  const orgId = fromQuery && fromQuery === session.org.id ? fromQuery : session.org.id;
  return { orgId, actor: session.actor };
}

export default async function InvoicePreviewPage({ params, searchParams }: InvoicePreviewPageProps) {
  const { invoiceId } = await params;
  const resolvedSearchParams = await searchParams;
  const session = await resolveSession(resolvedSearchParams);

  if (!session.orgId || !session.actor) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">You do not have access to this invoice.</p>
        </Card>
      </PageContainer>
    );
  }

  const invoiceResult = await getInvoiceDocumentData({
    orgId: session.orgId,
    invoiceId,
    actor: session.actor,
  });

  if (!invoiceResult.ok) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invoice not found or access denied.</p>
        </Card>
      </PageContainer>
    );
  }

  if (!canManageJobs(session.actor)) {
    const data = invoiceResult.data;
    return (
      <PageContainer>
        <Card>
          <h2 className="text-lg font-semibold text-text-primary">Invoice summary</h2>
          <p className="text-xs text-text-tertiary mt-1">Full invoice details are restricted to managers.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-tertiary">Invoice number</p>
              <p className="font-semibold text-text-primary">{data.invoice.number}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Status</p>
              <p className="font-semibold text-text-primary">{data.invoice.status}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Total</p>
              <p className="font-semibold text-text-primary">
                {formatCurrency(data.invoice.totalCents, data.invoice.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Due</p>
              <p className="font-semibold text-text-primary">{formatInvoiceDate(data.invoice.dueAt)}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-text-tertiary">Job</p>
              <p className="font-semibold text-text-primary">{data.job.title}</p>
              {formatAddress(data.job.address) && (
                <p className="text-xs text-text-tertiary mt-1">{formatAddress(data.job.address)}</p>
              )}
            </div>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return <InvoicePreviewDocument data={invoiceResult.data} orgId={session.orgId} />;
}
