import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import type { InvoiceDocumentData } from '@/lib/invoices/document';
import { cn } from '@/lib/utils';
import {
  formatAddress,
  formatCurrency,
  formatInvoiceDate,
  formatQuantity,
  resolveBrandColor,
} from '@/lib/invoices/format';

const manrope = Manrope({ subsets: ['latin'] });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--invoice-serif' });

type InvoicePreviewDocumentProps = {
  data: InvoiceDocumentData;
  orgId: string;
  showActions?: boolean;
  showBackLink?: boolean;
  showBrandingHint?: boolean;
  pdfUrl?: string;
};

function getStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'issued' || normalized === 'sent') return 'Issued';
  if (normalized === 'partially_paid') return 'Partially paid';
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'void') return 'Void';
  return status;
}

export default function InvoicePreviewDocument({
  data,
  orgId,
  showActions = true,
  showBackLink = true,
  showBrandingHint = true,
  pdfUrl,
}: InvoicePreviewDocumentProps) {
  const accent = resolveBrandColor(data.org.brandPrimaryColor, '#111827');
  const accentSoft = resolveBrandColor(data.org.brandSecondaryColor, '#f59e0b');
  const brandStyles = { '--invoice-accent': accent, '--invoice-soft': accentSoft } as CSSProperties;
  const invoiceDate = data.invoice.issuedAt ?? data.invoice.createdAt ?? null;
  const hasLineItems = data.invoice.lineItems.length > 0;
  const orgAddress = formatAddress(data.org.address);
  const jobAddress = formatAddress(data.job.address);
  const resolvedPdfUrl = pdfUrl ?? `/api/invoices/${data.invoice.id}/pdf?orgId=${orgId}`;

  return (
    <div className={cn('min-h-screen bg-slate-100 text-slate-900', manrope.className, cormorant.variable)} style={brandStyles}>
      {showActions && (
        <div className="border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {showBackLink && (
                <Link href={`/jobs/${data.job.id}?orgId=${orgId}`} className="text-slate-900 hover:text-slate-700">
                  Back to job
                </Link>
              )}
              <span>Invoice preview</span>
            </div>
            <div className="flex items-center gap-2">
              {showBrandingHint && !data.org.logoPath && (
                <Link
                  href={`/settings?orgId=${orgId}`}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Upload branding
                </Link>
              )}
              <a
                href={resolvedPdfUrl}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
              >
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-[var(--invoice-accent)]" />
          {data.invoice.status.toLowerCase() === 'draft' && (
            <div className="pointer-events-none absolute right-8 top-14 rotate-12 text-5xl font-semibold uppercase tracking-[0.4em] text-slate-200">
              Draft
            </div>
          )}

          <div className="space-y-10 px-10 py-12">
            <header className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                {data.org.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.org.logoPath}
                    alt={`${data.org.name} logo`}
                    className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                    Logo
                  </div>
                )}
                <div>
                  <p className="text-2xl font-semibold text-slate-900 font-[var(--invoice-serif)]">{data.org.name}</p>
                  {orgAddress && <p className="text-xs text-slate-500">{orgAddress}</p>}
                </div>
              </div>

              <div className="text-right">
                <p className="text-3xl font-semibold text-slate-900 font-[var(--invoice-serif)]">Invoice</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">Invoice number</p>
                <p className="text-lg font-semibold text-slate-900">{data.invoice.number}</p>
                <div className="mt-4 grid gap-1 text-xs text-slate-500">
                  <div className="flex items-center justify-end gap-2">
                    <span>Issue date</span>
                    <span className="font-medium text-slate-700">{formatInvoiceDate(invoiceDate)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span>Due date</span>
                    <span className="font-medium text-slate-700">{formatInvoiceDate(data.invoice.dueAt)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span>Status</span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {getStatusLabel(data.invoice.status)}
                    </span>
                  </div>
                </div>
              </div>
            </header>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Bill to</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{data.client?.name ?? 'Client'}</p>
                  {data.client?.email && <p className="text-xs text-slate-500">{data.client.email}</p>}
                  {data.client?.phone && <p className="text-xs text-slate-500">{data.client.phone}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Job</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{data.job.title}</p>
                  <p className="text-xs text-slate-500">Job ID: {data.job.id}</p>
                  {jobAddress && <p className="text-xs text-slate-500">{jobAddress}</p>}
                </div>
              </div>
            </section>

            {data.invoice.summary && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Summary</p>
                <p className="mt-2 text-sm text-slate-700">{data.invoice.summary}</p>
              </div>
            )}

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Line items</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                  {data.invoice.currency}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[2.6fr_0.7fr_0.9fr_0.9fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Tax</span>
                  <span className="text-right">Line total</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {hasLineItems ? (
                    data.invoice.lineItems.map((item, index) => (
                      <div key={`${item.description}-${index}`} className="grid grid-cols-[2.6fr_0.7fr_0.9fr_0.9fr_1fr] gap-3 px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{item.description}</p>
                          {item.jobLinkType && <p className="text-xs text-slate-400">Linked: {item.jobLinkType}</p>}
                        </div>
                        <p className="text-slate-600">{formatQuantity(item.quantity)}</p>
                        <p className="text-slate-600">{formatCurrency(item.unitPriceCents, data.invoice.currency)}</p>
                        <p className="text-slate-600">
                          {item.taxRate === 10 ? 'GST 10%' : `${item.taxRate ?? 0}%`}
                        </p>
                        <p className="text-right font-semibold text-slate-900">
                          {formatCurrency(item.totalCents, data.invoice.currency)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No billable items yet.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="flex flex-col items-end gap-4">
              <div className="w-full max-w-sm space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">
                    {formatCurrency(data.invoice.subtotalCents, data.invoice.currency)}
                  </span>
                </div>
                {data.taxBreakdown.length > 0 ? (
                  data.taxBreakdown.map((tax) => (
                    <div key={tax.rate} className="flex items-center justify-between text-xs text-slate-500">
                      <span>{tax.rate === 10 ? 'GST 10%' : `Tax ${tax.rate}%`}</span>
                      <span className="text-slate-700">{formatCurrency(tax.cents, data.invoice.currency)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Tax</span>
                    <span className="text-slate-700">{formatCurrency(0, data.invoice.currency)}</span>
                  </div>
                )}
                <div className="h-px bg-slate-200" />
                <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                  <span>Total due</span>
                  <span>{formatCurrency(data.invoice.totalCents, data.invoice.currency)}</span>
                </div>
              </div>

              <div className="text-right text-xs text-slate-500">
                Payment due by {formatInvoiceDate(data.invoice.dueAt)} ({data.invoice.currency})
              </div>
            </section>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-xs text-slate-500">
              Please contact {data.org.name} if you have any questions about this invoice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
