import InvoicePdfDocument from '@/components/invoices/InvoicePdfDocument';
import { getInvoiceDocumentData } from '@/lib/invoices/document';
import { renderPdfToBuffer, resolvePdfImageDataUrl } from '@/lib/invoices/pdf';
import { getInvoiceShareByTokenHash } from '@/lib/queries/job_invoices';
import { hashToken } from '@/lib/security/tokens';

export const runtime = 'nodejs';

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) {
    return new Response('Invalid invoice link', { status: 404 });
  }

  const tokenHash = hashToken(token);
  const shareResult = await getInvoiceShareByTokenHash({ tokenHash });
  if (!shareResult.ok) {
    return new Response('Invoice link not found', { status: 404 });
  }

  const status = String(shareResult.data.status ?? '').toLowerCase();
  if (status === 'draft' || status === 'void') {
    return new Response('Invoice is not available', { status: 404 });
  }

  const invoiceResult = await getInvoiceDocumentData({
    orgId: shareResult.data.orgId,
    invoiceId: shareResult.data.invoiceId,
  });
  if (!invoiceResult.ok) {
    return new Response('Invoice not found', { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const logoDataUrl = await resolvePdfImageDataUrl(invoiceResult.data.org.logoPath, origin);
  const pdfData = logoDataUrl
    ? { ...invoiceResult.data, org: { ...invoiceResult.data.org, logoPath: logoDataUrl } }
    : { ...invoiceResult.data, org: { ...invoiceResult.data.org, logoPath: null } };

  const doc = InvoicePdfDocument({ data: pdfData });
  const buffer = await renderPdfToBuffer(doc);
  const safeNumber = sanitizeFilename(invoiceResult.data.invoice.number || 'invoice');
  const filename = `invoice-${safeNumber || invoiceResult.data.invoice.id.slice(0, 8)}.pdf`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
