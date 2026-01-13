import { computeInvoiceTotals, deriveInvoiceSummary, type InvoiceLineItem } from '@/lib/financials/invoiceState';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { getJobById } from '@/lib/queries/jobs';
import { listJobContacts } from '@/lib/queries/job_contacts';
import { getClientById } from '@/lib/queries/clients';
import { getOrgById } from '@/lib/queries/orgs';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { err, ok, type Result } from '@/lib/result';
import type { RequestActor } from '@/lib/authz';
import type { AddressParts } from '@/lib/invoices/format';

export type InvoiceDocumentData = {
  org: {
    name: string;
    logoPath: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
    address: AddressParts | null;
  };
  job: {
    id: string;
    title: string;
    address: AddressParts | null;
  };
  client: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  invoice: {
    id: string;
    number: string;
    status: string;
    issuedAt: Date | null;
    dueAt: Date | null;
    createdAt: Date | null;
    currency: string;
    summary: string | null;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    lineItems: InvoiceLineItem[];
  };
  taxBreakdown: Array<{ rate: number; cents: number }>;
};

export function resolveInvoiceClient(params: {
  clientRecord?: { displayName: string; email?: string | null; phone?: string | null } | null;
  clientContact?: { name?: string | null; email?: string | null; phone?: string | null } | null;
}): InvoiceDocumentData['client'] {
  if (params.clientRecord) {
    return {
      name: params.clientRecord.displayName ?? null,
      email: params.clientRecord.email ?? null,
      phone: params.clientRecord.phone ?? null,
    };
  }
  if (params.clientContact) {
    return {
      name: params.clientContact.name ?? null,
      email: params.clientContact.email ?? null,
      phone: params.clientContact.phone ?? null,
    };
  }
  return null;
}

function extractAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}): AddressParts | null {
  const hasAny = Boolean(
    parts.addressLine1 ||
      parts.addressLine2 ||
      parts.suburb ||
      parts.state ||
      parts.postcode ||
      parts.country
  );
  if (!hasAny) return null;
  return {
    line1: parts.addressLine1 ?? null,
    line2: parts.addressLine2 ?? null,
    suburb: parts.suburb ?? null,
    state: parts.state ?? null,
    postcode: parts.postcode ?? null,
    country: parts.country ?? null,
  };
}

function buildTaxBreakdown(lineItems: InvoiceLineItem[]): Array<{ rate: number; cents: number }> {
  const breakdown = new Map<number, number>();
  for (const item of lineItems) {
    const rate = Number.isFinite(item.taxRate ?? NaN) ? Number(item.taxRate ?? 0) : 0;
    const key = Number(rate.toFixed(2));
    breakdown.set(key, (breakdown.get(key) ?? 0) + Number(item.taxCents ?? 0));
  }
  return Array.from(breakdown.entries())
    .map(([rate, cents]) => ({ rate, cents }))
    .sort((a, b) => a.rate - b.rate);
}

function buildFallbackLineItem(params: {
  summary: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}): InvoiceLineItem {
  const baseAmount = params.subtotalCents > 0 ? params.subtotalCents : params.totalCents;
  const taxRate =
    baseAmount > 0 ? Number(((params.taxCents / baseAmount) * 100).toFixed(2)) : 0;
  return {
    description: params.summary ?? 'Invoice total',
    quantity: 1,
    unitPriceCents: baseAmount,
    amountCents: baseAmount,
    taxRate,
    taxCents: params.taxCents,
    totalCents: params.totalCents,
    jobLinkType: null,
  };
}

export async function getInvoiceDocumentData(params: {
  orgId: string;
  invoiceId: string;
  actor?: RequestActor;
}): Promise<Result<InvoiceDocumentData>> {
  const invoiceResult = await getJobInvoiceById({
    orgId: params.orgId,
    invoiceId: params.invoiceId,
    actor: params.actor,
  });
  if (!invoiceResult.ok) return err(invoiceResult.error.code, invoiceResult.error.message, invoiceResult.error.details);
  if (!invoiceResult.data) return err('NOT_FOUND', 'Invoice not found');

  const jobResult = await getJobById(invoiceResult.data.jobId, params.orgId, params.actor);
  if (!jobResult.ok) return err(jobResult.error.code, jobResult.error.message, jobResult.error.details);

  const [orgResult, settingsResult, contactsResult] = await Promise.all([
    getOrgById({ orgId: params.orgId }),
    getOrgSettings({ orgId: params.orgId }),
    listJobContacts({ orgId: params.orgId, jobId: invoiceResult.data.jobId }),
  ]);

  if (!orgResult.ok) return err(orgResult.error.code, orgResult.error.message, orgResult.error.details);

  const org = orgResult.data;
  const settings = settingsResult.ok ? settingsResult.data : null;
  const contacts = contactsResult.ok ? contactsResult.data : [];
  const clientContact =
    contacts.find((contact) => String(contact.role ?? '').toLowerCase() === 'client') ??
    contacts[0] ??
    null;
  const clientRecord = jobResult.data.clientId
    ? await getClientById({ orgId: params.orgId, clientId: jobResult.data.clientId })
    : null;
  const client = resolveInvoiceClient({
    clientRecord: clientRecord && clientRecord.ok ? clientRecord.data : null,
    clientContact,
  });

  const totals = computeInvoiceTotals({
    lineItems: invoiceResult.data.lineItems,
    amountCents: invoiceResult.data.amountCents,
    subtotalCents: invoiceResult.data.subtotalCents ?? null,
    taxCents: invoiceResult.data.taxCents ?? null,
    totalCents: invoiceResult.data.totalCents ?? null,
  });

  const summary = deriveInvoiceSummary({
    summary: invoiceResult.data.summary ?? null,
    lineItems: totals.lineItems ?? null,
    jobTitle: jobResult.data.title,
  });

  const lineItems =
    totals.lineItems ??
    (totals.totalCents > 0
      ? [buildFallbackLineItem({ summary, subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents })]
      : []);

  const invoiceNumber =
    invoiceResult.data.invoiceNumber ??
    invoiceResult.data.externalRef ??
    invoiceResult.data.xeroInvoiceId ??
    invoiceResult.data.id.slice(0, 8);

  return ok({
    org: {
      name: org?.name ?? settings?.companyName ?? 'Organisation',
      logoPath: org?.logoPath ?? settings?.companyLogoPath ?? null,
      brandPrimaryColor: org?.brandPrimaryColor ?? null,
      brandSecondaryColor: org?.brandSecondaryColor ?? null,
      address: extractAddress({
        addressLine1: settings?.hqAddressLine1 ?? null,
        addressLine2: settings?.hqAddressLine2 ?? null,
        suburb: settings?.hqSuburb ?? null,
        state: settings?.hqState ?? null,
        postcode: settings?.hqPostcode ?? null,
        country: 'AU',
      }),
    },
    job: {
      id: jobResult.data.id,
      title: jobResult.data.title,
      address: extractAddress({
        addressLine1: jobResult.data.addressLine1 ?? null,
        addressLine2: jobResult.data.addressLine2 ?? null,
        suburb: jobResult.data.suburb ?? null,
        state: jobResult.data.state ?? null,
        postcode: jobResult.data.postcode ?? null,
        country: jobResult.data.country ?? null,
      }),
    },
    client,
    invoice: {
      id: invoiceResult.data.id,
      number: invoiceNumber,
      status: String(invoiceResult.data.status ?? 'draft'),
      issuedAt: invoiceResult.data.issuedAt ?? null,
      dueAt: invoiceResult.data.dueAt ?? null,
      createdAt: invoiceResult.data.createdAt ?? null,
      currency: invoiceResult.data.currency ?? 'AUD',
      summary,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      lineItems,
    },
    taxBreakdown: buildTaxBreakdown(lineItems),
  });
}
