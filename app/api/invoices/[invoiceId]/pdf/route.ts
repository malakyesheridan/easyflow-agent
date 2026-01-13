import InvoicePdfDocument from '@/components/invoices/InvoicePdfDocument';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';
import { getInvoiceDocumentData } from '@/lib/invoices/document';
import { renderPdfToBuffer, resolvePdfImageDataUrl } from '@/lib/invoices/pdf';

export const runtime = 'nodejs';

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: Request, context: { params: { invoiceId: string } }) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const auth = await requireOrgContext(req, orgId);
  if (!auth.ok) {
    const status = auth.error.code === 'FORBIDDEN' ? 403 : 401;
    return new Response(auth.error.message, { status });
  }
  if (!canManageJobs(auth.data.actor)) {
    return new Response('Insufficient permissions', { status: 403 });
  }

  const invoiceResult = await getInvoiceDocumentData({
    orgId: auth.data.orgId,
    invoiceId: context.params.invoiceId,
    actor: auth.data.actor,
  });

  if (!invoiceResult.ok) {
    return new Response(invoiceResult.error.message, { status: invoiceResult.error.code === 'NOT_FOUND' ? 404 : 400 });
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
