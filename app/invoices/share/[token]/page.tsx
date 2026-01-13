import { Card, PageContainer } from '@/components/ui';
import InvoicePreviewDocument from '@/components/invoices/InvoicePreviewDocument';
import { getInvoiceDocumentData } from '@/lib/invoices/document';
import { getInvoiceShareByTokenHash } from '@/lib/queries/job_invoices';
import { hashToken } from '@/lib/security/tokens';

interface InvoiceSharePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvoiceSharePage({ params }: InvoiceSharePageProps) {
  const { token } = await params;
  if (!token) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invalid invoice link.</p>
        </Card>
      </PageContainer>
    );
  }

  const tokenHash = hashToken(token);
  const shareResult = await getInvoiceShareByTokenHash({ tokenHash });
  if (!shareResult.ok) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">This invoice link is invalid or has expired.</p>
        </Card>
      </PageContainer>
    );
  }

  const status = String(shareResult.data.status ?? '').toLowerCase();
  if (status === 'draft' || status === 'void') {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">This invoice is not available.</p>
        </Card>
      </PageContainer>
    );
  }

  const invoiceResult = await getInvoiceDocumentData({
    orgId: shareResult.data.orgId,
    invoiceId: shareResult.data.invoiceId,
  });

  if (!invoiceResult.ok) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invoice not found.</p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <InvoicePreviewDocument
      data={invoiceResult.data}
      orgId={shareResult.data.orgId}
      showBackLink={false}
      showBrandingHint={false}
      pdfUrl={`/api/invoices/share/${token}/pdf`}
    />
  );
}
