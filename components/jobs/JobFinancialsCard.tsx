"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Input, Select, Textarea } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobInvoiceLineItem = {
  id?: string;
  description: string;
  quantity?: number;
  unitPriceCents?: number;
  amountCents?: number;
  taxRate?: number | null;
  taxCents?: number;
  totalCents?: number;
  jobLinkType?: string | null;
};

type JobInvoiceRow = {
  id: string;
  jobId: string;
  status: string;
  invoiceNumber: string | null;
  summary: string | null;
  amountCents: number;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string;
  createdAt: string;
  sentAt: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  lineItems: JobInvoiceLineItem[] | null;
  xeroInvoiceId: string | null;
  xeroStatus: string | null;
  xeroInvoiceUrl: string | null;
  xeroLastSyncedAt: string | null;
  xeroSyncError: string | null;
  externalRef: string | null;
  pdfUrl: string | null;
};

type JobPaymentRow = {
  id: string;
  status: string;
  provider: string;
  method: string;
  amountCents: number;
  currency: string;
  paymentLinkUrl: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
};

type IntegrationRow = {
  id: string;
  provider: string;
  enabled: boolean;
  status: string;
};

type SessionPayload = {
  actor?: { capabilities?: string[] } | null;
};

const invoiceStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-bg-section/80 text-text-tertiary' },
  issued: { label: 'Issued', className: 'bg-amber-500/10 text-amber-300' },
  sent: { label: 'Issued', className: 'bg-amber-500/10 text-amber-300' },
  partially_paid: { label: 'Partially paid', className: 'bg-amber-500/10 text-amber-300' },
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-300' },
  overdue: { label: 'Overdue', className: 'bg-red-500/10 text-red-300' },
  void: { label: 'Void', className: 'bg-bg-section/80 text-text-tertiary' },
};

const paymentMethodLabels: Record<string, string> = {
  stripe: 'Stripe',
  external: 'External',
  none: 'None',
};

const paymentStatusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-500/10 text-amber-300' },
  succeeded: { label: 'Succeeded', className: 'bg-emerald-500/10 text-emerald-300' },
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  refunded: { label: 'Refunded', className: 'bg-bg-section/80 text-text-tertiary' },
  cancelled: { label: 'Cancelled', className: 'bg-bg-section/80 text-text-tertiary' },
};

const xeroStatusMeta: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Xero Draft', className: 'bg-bg-section/80 text-text-tertiary' },
  SUBMITTED: { label: 'Xero Submitted', className: 'bg-amber-500/10 text-amber-300' },
  AUTHORISED: { label: 'Xero Authorised', className: 'bg-amber-500/10 text-amber-300' },
  PAID: { label: 'Xero Paid', className: 'bg-emerald-500/10 text-emerald-300' },
  VOIDED: { label: 'Xero Voided', className: 'bg-bg-section/80 text-text-tertiary' },
};

function formatAmount(amountCents: number, currency: string) {
  const amount = amountCents / 100;
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

function canManagePayments(payload: SessionPayload | null): boolean {
  const caps = payload?.actor?.capabilities ?? [];
  return caps.includes('admin') || caps.includes('manage_jobs');
}

function canManageIntegrations(payload: SessionPayload | null): boolean {
  const caps = payload?.actor?.capabilities ?? [];
  return caps.includes('admin') || caps.includes('manage_org');
}

function isSuccessPayment(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'paid' || normalized === 'succeeded';
}

type InvoiceLineDraft = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxMode: 'zero' | 'gst' | 'custom';
  jobLinkType: string;
};

const DEFAULT_TAX_RATE = 10;
const DEFAULT_DUE_DAYS = 14;

const jobLinkOptions = [
  { value: '', label: 'Unlinked' },
  { value: 'labour', label: 'Labour' },
  { value: 'material', label: 'Material' },
  { value: 'subcontract', label: 'Subcontract' },
];

function createLineId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date: Date | null) {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

function parseNumberInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseCurrencyToCents(value: string) {
  const parsed = parseNumberInput(value);
  if (parsed === null) return null;
  return Math.max(0, Math.round(parsed * 100));
}

function getLineAmounts(item: InvoiceLineDraft) {
  const quantity = Math.max(0, parseNumberInput(item.quantity) ?? 0);
  const unitPriceCents = parseCurrencyToCents(item.unitPrice) ?? 0;
  const subtotalCents = Math.round(quantity * unitPriceCents);
  const taxRate = Math.max(0, parseNumberInput(item.taxRate) ?? 0);
  const taxCents = Math.round(subtotalCents * (taxRate / 100));
  return { quantity, unitPriceCents, subtotalCents, taxRate, taxCents, totalCents: subtotalCents + taxCents };
}

export default function JobFinancialsCard(props: { orgId: string; jobId: string }) {
  const [invoice, setInvoice] = useState<JobInvoiceRow | null>(null);
  const [payments, setPayments] = useState<JobPaymentRow[]>([]);
  const [stripeIntegration, setStripeIntegration] = useState<IntegrationRow | null>(null);
  const [xeroIntegration, setXeroIntegration] = useState<IntegrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canManageIntegrationState, setCanManageIntegrationState] = useState(false);

  const [showInvoiceBuilder, setShowInvoiceBuilder] = useState(false);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState('');
  const [invoiceSummary, setInvoiceSummary] = useState('');
  const [invoiceIssueDate, setInvoiceIssueDate] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('AUD');
  const [invoiceLineItems, setInvoiceLineItems] = useState<InvoiceLineDraft[]>([]);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('eft');
  const [paymentPaidAt, setPaymentPaidAt] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [xeroSyncError, setXeroSyncError] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const invoiceSwipe = useSwipeToClose(() => setShowInvoiceBuilder(false), isMobile);
  const paymentSwipe = useSwipeToClose(() => setShowPaymentModal(false), isMobile);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoiceRes, integrationsRes, sessionRes] = await Promise.all([
        fetch(`/api/job-invoices?orgId=${props.orgId}&jobId=${props.jobId}&limit=1`),
        fetch(`/api/integrations?orgId=${props.orgId}`),
        fetch('/api/auth/session'),
      ]);

      const invoiceJson = (await invoiceRes.json()) as ApiResponse<JobInvoiceRow[]>;
      const integrationsJson = (await integrationsRes.json()) as ApiResponse<IntegrationRow[]>;
      const sessionJson = (await sessionRes.json()) as ApiResponse<SessionPayload>;

      if (!invoiceRes.ok || !invoiceJson.ok) {
        throw new Error(invoiceJson.ok ? 'Failed to load invoice.' : invoiceJson.error?.message || 'Failed to load invoice.');
      }
      const latestInvoice = invoiceJson.data?.[0] ?? null;
      setInvoice(latestInvoice);
      setShareLink(latestInvoice?.pdfUrl ?? null);

      if (sessionRes.ok && sessionJson.ok) {
        setCanManage(canManagePayments(sessionJson.data));
        const canManageIntegrationsValue = canManageIntegrations(sessionJson.data);
        setCanManageIntegrationState(canManageIntegrationsValue);
        if (canManageIntegrationsValue && integrationsRes.ok && integrationsJson.ok) {
          const stripe = (integrationsJson.data ?? []).find((row) => row.provider === 'stripe') ?? null;
          const xero = (integrationsJson.data ?? []).find((row) => row.provider === 'xero') ?? null;
          setStripeIntegration(stripe);
          setXeroIntegration(xero);
        } else {
          setStripeIntegration(null);
          setXeroIntegration(null);
        }
      } else {
        setCanManage(false);
        setCanManageIntegrationState(false);
        setStripeIntegration(null);
        setXeroIntegration(null);
      }

      if (latestInvoice) {
        const paymentsRes = await fetch(`/api/invoices/${latestInvoice.id}/payments?orgId=${props.orgId}`);
        const paymentsJson = (await paymentsRes.json()) as ApiResponse<JobPaymentRow[]>;
        if (!paymentsRes.ok || !paymentsJson.ok) {
          throw new Error(paymentsJson.ok ? 'Failed to load payments.' : paymentsJson.error?.message || 'Failed to load payments.');
        }
        setPayments(paymentsJson.data ?? []);
      } else {
        setPayments([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load financials');
      setInvoice(null);
      setPayments([]);
      setStripeIntegration(null);
      setXeroIntegration(null);
      setShareLink(null);
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCents = invoice ? Number(invoice.totalCents ?? invoice.amountCents ?? 0) : 0;
  const paidCents = payments.reduce((sum, payment) => {
    if (isSuccessPayment(payment.status)) {
      return sum + Number(payment.amountCents ?? 0);
    }
    return sum;
  }, 0);
  const outstandingCents = Math.max(0, totalCents - paidCents);
  const dueAt = invoice?.dueAt ?? invoice?.issuedAt ?? invoice?.sentAt ?? null;
  const normalizedStatus = invoice ? String(invoice.status ?? '').toLowerCase() : 'draft';
  const isOverdue =
    Boolean(dueAt) &&
    outstandingCents > 0 &&
    !['paid', 'void'].includes(normalizedStatus) &&
    new Date(dueAt as string).getTime() < Date.now();
  const displayStatus = invoice
    ? (isOverdue ? 'overdue' : normalizedStatus || 'draft')
    : 'draft';

  const statusBadge = useMemo(() => {
    return invoice ? invoiceStatusMeta[displayStatus] ?? invoiceStatusMeta.draft : null;
  }, [invoice, displayStatus]);

  const xeroStatusBadge = useMemo(() => {
    const key = invoice?.xeroStatus ? invoice.xeroStatus.toUpperCase() : '';
    if (!key) return null;
    return xeroStatusMeta[key] ?? null;
  }, [invoice?.xeroStatus]);

  const paymentProviderLabel = useMemo(() => {
    if (!payments.length) return paymentMethodLabels.none;
    if (payments.some((payment) => payment.provider === 'stripe')) return paymentMethodLabels.stripe;
    if (payments.some((payment) => payment.provider === 'external')) return paymentMethodLabels.external;
    return paymentMethodLabels.none;
  }, [payments]);

  const latestPaymentLink = useMemo(() => {
    return payments.find((payment) => payment.paymentLinkUrl && payment.status === 'pending') ?? null;
  }, [payments]);

  const invoicePreviewUrl = invoice ? `/invoices/${invoice.id}/preview?orgId=${props.orgId}` : null;
  const invoicePdfUrl = invoice ? `/api/invoices/${invoice.id}/pdf?orgId=${props.orgId}` : null;

  const invoiceLineMeta = useMemo(() => {
    let subtotalCents = 0;
    let taxCents = 0;
    const taxByRate = new Map<number, number>();
    const lineById = new Map<string, { subtotalCents: number; taxCents: number; totalCents: number }>();

    for (const item of invoiceLineItems) {
      const amounts = getLineAmounts(item);
      subtotalCents += amounts.subtotalCents;
      taxCents += amounts.taxCents;
      const taxKey = Number(amounts.taxRate.toFixed(2));
      taxByRate.set(taxKey, (taxByRate.get(taxKey) ?? 0) + amounts.taxCents);
      lineById.set(item.id, {
        subtotalCents: amounts.subtotalCents,
        taxCents: amounts.taxCents,
        totalCents: amounts.totalCents,
      });
    }

    return {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      taxByRate,
      lineById,
    };
  }, [invoiceLineItems]);

  const createDraftLineItem = (seed: Partial<InvoiceLineDraft> = {}): InvoiceLineDraft => ({
    id: createLineId(),
    description: '',
    quantity: '1',
    unitPrice: '',
    taxRate: String(DEFAULT_TAX_RATE),
    taxMode: 'gst',
    jobLinkType: '',
    ...seed,
  });

  const buildDraftLineItems = (source: JobInvoiceRow | null): InvoiceLineDraft[] => {
    const items = source?.lineItems ?? [];
    if (items.length > 0) {
      return items.map((item) => {
        const quantityRaw = Number(item.quantity ?? 1);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
        const amountCents = Number(item.amountCents ?? 0);
        const unitPriceCents = Number.isFinite(item.unitPriceCents ?? NaN)
          ? Number(item.unitPriceCents)
          : quantity > 0
            ? Math.round(amountCents / quantity)
            : amountCents;
        const taxCents = Number(item.taxCents ?? 0);
        let taxRate = item.taxRate ?? null;
        if (taxRate === null || taxRate === undefined) {
          taxRate = amountCents > 0 && taxCents > 0 ? Number(((taxCents / amountCents) * 100).toFixed(2)) : 0;
        }
        if (!Number.isFinite(taxRate)) taxRate = 0;
        const taxMode = taxRate === 0 ? 'zero' : taxRate === DEFAULT_TAX_RATE ? 'gst' : 'custom';
        const unitPriceValue = Number.isFinite(unitPriceCents) ? (unitPriceCents / 100).toFixed(2) : '';
        const quantityValue = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, '');

        return createDraftLineItem({
          description: item.description ?? '',
          quantity: quantityValue,
          unitPrice: unitPriceCents === 0 ? '0.00' : unitPriceValue,
          taxRate: String(taxRate),
          taxMode,
          jobLinkType: item.jobLinkType ?? '',
        });
      });
    }

    const total = source ? Number(source.totalCents ?? source.amountCents ?? 0) : 0;
    const summaryFallback = source?.summary ?? source?.lineItems?.[0]?.description ?? '';
    if (total > 0) {
      return [
        createDraftLineItem({
          description: summaryFallback || 'Job invoice',
          unitPrice: (total / 100).toFixed(2),
          taxRate: '0',
          taxMode: 'zero',
        }),
      ];
    }

    return [createDraftLineItem()];
  };

  const openInvoiceBuilder = () => {
    const issueDate = invoice?.issuedAt ? new Date(invoice.issuedAt) : new Date();
    const dueDate = invoice?.dueAt ? new Date(invoice.dueAt) : addDays(issueDate, DEFAULT_DUE_DAYS);
    const summary = invoice?.summary ?? invoice?.lineItems?.[0]?.description ?? '';

    setInvoiceNumberInput(invoice?.invoiceNumber ?? '');
    setInvoiceSummary(summary);
    setInvoiceCurrency(invoice?.currency ?? 'AUD');
    setInvoiceIssueDate(toDateInputValue(issueDate));
    setInvoiceDueDate(toDateInputValue(dueDate));
    setInvoiceLineItems(buildDraftLineItems(invoice));
    setInvoiceError(null);
    setShowInvoiceBuilder(true);
  };

  const addInvoiceLineItem = (seed: Partial<InvoiceLineDraft> = {}) => {
    setInvoiceLineItems((items) => [...items, createDraftLineItem(seed)]);
  };

  const updateInvoiceLineItem = (id: string, updates: Partial<InvoiceLineDraft>) => {
    setInvoiceLineItems((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeInvoiceLineItem = (id: string) => {
    setInvoiceLineItems((items) => {
      const next = items.filter((item) => item.id !== id);
      return next.length > 0 ? next : [createDraftLineItem()];
    });
  };

  const handleLineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addInvoiceLineItem();
  };

  const submitInvoice = async (
    action: 'draft' | 'issue',
    options: { closeAfterSave?: boolean; openPreview?: boolean } = {}
  ): Promise<string | null> => {
    const payloadItems: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxRate: number;
      jobLinkType: string | null;
    }> = [];
    let hasInvalidLine = false;

    for (const item of invoiceLineItems) {
      const description = item.description.trim();
      const quantityValue = parseNumberInput(item.quantity);
      const unitPriceCents = parseCurrencyToCents(item.unitPrice);
      const taxRateValue = Math.max(0, parseNumberInput(item.taxRate) ?? 0);
      const hasAnyInput = Boolean(description || item.quantity.trim() || item.unitPrice.trim());

      if (!hasAnyInput) continue;
      if (!description || quantityValue === null || quantityValue <= 0 || unitPriceCents === null || unitPriceCents < 0) {
        hasInvalidLine = true;
        continue;
      }

      payloadItems.push({
        description,
        quantity: quantityValue,
        unitPriceCents,
        taxRate: taxRateValue,
        jobLinkType: item.jobLinkType || null,
      });
    }

    if (hasInvalidLine) {
      setInvoiceError('Check line item quantities, descriptions, and unit prices.');
      return null;
    }
    if (payloadItems.length === 0) {
      setInvoiceError('Add at least one line item before saving.');
      return null;
    }

    setInvoiceSaving(true);
    setInvoiceError(null);

    const issueDate = invoiceIssueDate ? new Date(invoiceIssueDate).toISOString() : null;
    const dueAt = invoiceDueDate ? new Date(invoiceDueDate).toISOString() : null;
    const invoiceNumber = invoiceNumberInput.trim() || null;
    const summary = invoiceSummary.trim() || null;

    try {
      const url = invoice ? `/api/invoices/${invoice.id}` : `/api/jobs/${props.jobId}/invoices`;
      const method = invoice ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          currency: invoiceCurrency,
          invoiceNumber,
          summary,
          lineItems: payloadItems,
          issuedAt: issueDate,
          dueAt,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to save invoice.' : json.error?.message || 'Failed to save invoice.');
      }

      const savedInvoiceId = invoice?.id ?? json.data?.id;
      if (!savedInvoiceId) {
        throw new Error('Failed to resolve saved invoice.');
      }

      if (action === 'issue') {
        const issueRes = await fetch(`/api/invoices/${savedInvoiceId}/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: props.orgId,
            issuedAt: issueDate,
            dueAt,
          }),
        });
        const issueJson = (await issueRes.json()) as ApiResponse<any>;
        if (!issueRes.ok || !issueJson.ok) {
          throw new Error(issueJson.ok ? 'Failed to issue invoice.' : issueJson.error?.message || 'Failed to issue invoice.');
        }
      }

      if (options.openPreview) {
        window.open(`/invoices/${savedInvoiceId}/preview?orgId=${props.orgId}`, '_blank');
      }

      if (options.closeAfterSave !== false) {
        setShowInvoiceBuilder(false);
      }

      await load();
      return savedInvoiceId;
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Failed to save invoice.');
      return null;
    } finally {
      setInvoiceSaving(false);
    }
  };

  const previewInvoiceDraft = async () => {
    if (invoiceSaving) return;
    await submitInvoice('draft', { closeAfterSave: false, openPreview: true });
  };

  const submitStripeLink = async () => {
    if (!invoice) return;
    setLinkSaving(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/jobs/${props.jobId}/invoices/${invoice.id}/stripe-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: props.orgId }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to create payment link.' : json.error?.message || 'Failed to create payment link.');
      }
      await load();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Failed to create payment link.');
    } finally {
      setLinkSaving(false);
    }
  };

  const createShareLink = async () => {
    if (!invoice) return;
    setShareSaving(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: props.orgId }),
      });
      const json = (await res.json()) as ApiResponse<{ shareUrl: string }>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to create invoice link.' : json.error?.message || 'Failed to create invoice link.');
      }
      const link = json.data?.shareUrl ?? null;
      if (!link) throw new Error('Invoice link could not be generated.');
      await navigator.clipboard.writeText(link);
      setShareLink(link);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to create invoice link.');
    } finally {
      setShareSaving(false);
    }
  };

  const handleShareLink = async () => {
    if (shareLink) {
      try {
        await navigator.clipboard.writeText(shareLink);
      } catch (e) {
        setShareError(e instanceof Error ? e.message : 'Failed to copy invoice link.');
      }
      return;
    }
    await createShareLink();
  };

  const syncInvoiceToXero = async () => {
    if (!invoice) return;
    setXeroSyncing(true);
    setXeroSyncError(null);
    try {
      const res = await fetch('/api/integrations/xero/sync-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          invoiceId: invoice.id,
          jobId: props.jobId,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to sync invoice.' : json.error?.message || 'Failed to sync invoice.');
      }
      await load();
    } catch (e) {
      setXeroSyncError(e instanceof Error ? e.message : 'Failed to sync invoice.');
    } finally {
      setXeroSyncing(false);
    }
  };

  const openPaymentModal = () => {
    const amountValue = outstandingCents > 0 ? (outstandingCents / 100).toFixed(2) : '';
    setPaymentAmount(amountValue);
    setPaymentMethod('eft');
    setPaymentPaidAt(new Date().toISOString().slice(0, 16));
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    if (!invoice) return;
    const amountValue = Number(paymentAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setPaymentError('Enter a valid amount.');
      return;
    }
    setPaymentSaving(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          amountCents: Math.round(amountValue * 100),
          method: paymentMethod,
          paidAt: paymentPaidAt ? new Date(paymentPaidAt).toISOString() : null,
          reference: paymentReference || null,
          notes: paymentNotes || null,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to record payment.' : json.error?.message || 'Failed to record payment.');
      }
      setShowPaymentModal(false);
      await load();
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Failed to record payment.');
    } finally {
      setPaymentSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Financials</h2>
          <p className="text-xs text-text-tertiary mt-1">Invoice status, payments, and outstanding balance.</p>
        </div>
        {statusBadge && <Badge className={statusBadge.className}>{statusBadge.label}</Badge>}
      </div>

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading financials...</p>
      ) : invoice ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-tertiary">Total</p>
              <p className="text-sm font-semibold text-text-primary">{formatAmount(totalCents, invoice.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Paid</p>
              <p className="text-sm font-semibold text-text-primary">{formatAmount(paidCents, invoice.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Outstanding</p>
              <p className="text-sm font-semibold text-text-primary">{formatAmount(outstandingCents, invoice.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Due</p>
              <p className="text-sm font-semibold text-text-primary">
                {dueAt ? new Date(dueAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Payment method</p>
              <p className="text-sm font-semibold text-text-primary">{paymentProviderLabel}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Invoice</p>
              <p className="text-sm font-semibold text-text-primary">
                {invoice.invoiceNumber ?? invoice.externalRef ?? invoice.id.slice(0, 8)}
              </p>
            </div>
          </div>

          {canManageIntegrationState && (
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-text-tertiary">Xero sync</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {xeroIntegration?.status === 'connected'
                      ? xeroIntegration.enabled
                        ? 'Connected - Sync on'
                        : 'Connected - Sync off'
                      : 'Not connected'}
                  </p>
                  {invoice.xeroInvoiceId && (
                    <p className="text-[11px] text-text-tertiary mt-1">
                      Xero ID {invoice.xeroInvoiceId.slice(0, 8)}
                    </p>
                  )}
                </div>
                {xeroStatusBadge && (
                  <Badge className={xeroStatusBadge.className}>{xeroStatusBadge.label}</Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {invoice.xeroInvoiceUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(invoice.xeroInvoiceUrl ?? '', '_blank')}
                  >
                    View in Xero
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={syncInvoiceToXero}
                  disabled={
                    xeroSyncing ||
                    !xeroIntegration ||
                    xeroIntegration.status !== 'connected' ||
                    !xeroIntegration.enabled
                  }
                >
                  {xeroSyncing ? 'Syncing...' : 'Sync to Xero'}
                </Button>
              </div>

              {invoice.xeroLastSyncedAt && (
                <p className="text-[11px] text-text-tertiary mt-2">
                  Last synced {new Date(invoice.xeroLastSyncedAt).toLocaleString()}
                </p>
              )}
              {(xeroSyncError || invoice.xeroSyncError) && (
                <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-400">
                  {xeroSyncError || invoice.xeroSyncError}
                </div>
              )}
            </div>
          )}

          {latestPaymentLink?.paymentLinkUrl && latestPaymentLink.status === 'pending' && (
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3 text-xs text-text-secondary flex items-center justify-between gap-2">
              <span className="truncate">Payment link ready</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(latestPaymentLink.paymentLinkUrl ?? '')}
                >
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.open(latestPaymentLink.paymentLinkUrl ?? '', '_blank')}>
                  Open
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No invoice yet.</p>
      )}

      {linkError && (
        <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
          {linkError}
        </div>
      )}

      {shareError && (
        <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
          {shareError}
        </div>
      )}

      {shareLink && (
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-section/30 p-3 text-xs text-text-secondary flex items-center justify-between gap-2">
          <span className="truncate">Invoice link ready</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(shareLink)}
            >
              Copy link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.open(shareLink, '_blank')}>
              Open
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canManage && !invoice && (
          <Button variant="primary" size="sm" onClick={openInvoiceBuilder}>
            Create invoice
          </Button>
        )}
        {canManage && invoice && normalizedStatus === 'draft' && (
          <>
            <Button variant="primary" size="sm" onClick={openInvoiceBuilder}>
              Issue invoice
            </Button>
            <Button variant="secondary" size="sm" onClick={openInvoiceBuilder}>
              Edit draft
            </Button>
          </>
        )}
        {canManage && invoice && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(invoicePreviewUrl ?? '', '_blank')}
              disabled={!invoicePreviewUrl}
            >
              Preview
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(invoicePdfUrl ?? '', '_blank')}
              disabled={!invoicePdfUrl}
            >
              Download PDF
            </Button>
          </>
        )}
        {canManage && invoice && normalizedStatus !== 'draft' && normalizedStatus !== 'void' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleShareLink()}
            disabled={shareSaving}
          >
            {shareSaving ? 'Generating link...' : shareLink ? 'Copy invoice link' : 'Generate invoice link'}
          </Button>
        )}
        {canManage && invoice && normalizedStatus !== 'draft' && normalizedStatus !== 'void' && (
          <Button variant="secondary" size="sm" onClick={openPaymentModal}>
            Record payment
          </Button>
        )}
        {canManage && invoice && outstandingCents > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void submitStripeLink()}
            disabled={
              linkSaving ||
              (canManageIntegrationState &&
                (!stripeIntegration || !stripeIntegration.enabled || stripeIntegration.status !== 'connected'))
            }
          >
            {linkSaving ? 'Creating link...' : 'Send payment link'}
          </Button>
        )}
        {!canManage && (
          <p className="text-xs text-text-tertiary mt-2">You do not have permission to manage financials.</p>
        )}
      </div>

      {canManageIntegrationState &&
        invoice &&
        outstandingCents > 0 &&
        (!stripeIntegration || stripeIntegration.status !== 'connected') && (
        <div className="mt-3 text-xs text-text-tertiary">
          Stripe is not connected.{' '}
          <Link href="/settings/integrations" className="text-accent-gold hover:text-accent-gold/80">
            Connect it in Settings
          </Link>
          .
        </div>
      )}

      {canManageIntegrationState &&
        invoice &&
        outstandingCents > 0 &&
        stripeIntegration &&
        !stripeIntegration.enabled && (
        <div className="mt-3 text-xs text-text-tertiary">
          Stripe is connected but disabled. Enable it in Settings to collect payments.
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-text-tertiary">Payment history</p>
          {payments.slice(0, 5).map((payment) => (
            <div key={payment.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {formatAmount(payment.amountCents, payment.currency)}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {payment.method.toUpperCase()} - {new Date(payment.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge className={(paymentStatusMeta[payment.status]?.className ?? paymentStatusMeta.pending.className)}>
                  {paymentStatusMeta[payment.status]?.label ?? payment.status}
                </Badge>
              </div>
              {payment.reference && <p className="mt-2 text-text-tertiary">Ref: {payment.reference}</p>}
              {payment.notes && <p className="mt-1 text-text-tertiary">{payment.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showInvoiceBuilder && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInvoiceBuilder(false)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-4">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile
                  ? 'rounded-t-2xl mt-auto h-[94vh] overflow-hidden'
                  : 'rounded-lg w-[min(98vw,1400px)] h-[96vh] overflow-hidden'
              )}
              {...invoiceSwipe}
            >
              <div className="flex h-full flex-col">
                <div className="border-b border-border-subtle p-4 md:p-6">
                  {isMobile && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border-subtle" />}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                    <h3 className="text-lg font-semibold text-text-primary">Invoice Builder</h3>
                    <p className="text-xs text-text-tertiary mt-1">Compose line items, set dates, and issue when ready.</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setShowInvoiceBuilder(false)} disabled={invoiceSaving}>
                      Close
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden p-4 md:p-6 space-y-6 min-w-0">
                  {invoiceError && (
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                      {invoiceError}
                    </div>
                  )}

                  <section className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Invoice Header</h4>
                      <p className="text-xs text-text-tertiary mt-1">Core details for this invoice.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <Input
                        label="Invoice number"
                        placeholder="Auto-generated on save"
                        value={invoiceNumberInput}
                        onChange={(e) => setInvoiceNumberInput(e.target.value)}
                        disabled={invoiceSaving}
                      />
                      <Input label="Job reference" value={props.jobId} disabled />
                      <Select
                        label="Currency"
                        value={invoiceCurrency}
                        onChange={(e) => setInvoiceCurrency(e.target.value)}
                        disabled={invoiceSaving}
                      >
                        <option value="AUD">AUD</option>
                        <option value="NZD">NZD</option>
                        <option value="USD">USD</option>
                      </Select>
                    </div>
                    <Textarea
                      label="Summary"
                      placeholder="Invoice summary"
                      value={invoiceSummary}
                      onChange={(e) => setInvoiceSummary(e.target.value)}
                      disabled={invoiceSaving}
                    />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Issue date"
                        type="date"
                        value={invoiceIssueDate}
                        onChange={(e) => setInvoiceIssueDate(e.target.value)}
                        disabled={invoiceSaving}
                      />
                      <Input
                        label="Due date"
                        type="date"
                        value={invoiceDueDate}
                        onChange={(e) => setInvoiceDueDate(e.target.value)}
                        disabled={invoiceSaving}
                      />
                    </div>
                  </section>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2.2fr_1fr]">
                    <section className="space-y-3">
                      <div className={cn('flex items-center justify-between gap-3', isMobile && 'flex-col items-start')}>
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary">Line Items</h4>
                          <p className="text-xs text-text-tertiary mt-1">Break down work, materials, and services.</p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className={cn(isMobile && 'w-full')}
                          onClick={() => addInvoiceLineItem()}
                          disabled={invoiceSaving}
                        >
                          {isMobile ? 'Add line item' : 'Add row'}
                        </Button>
                      </div>

                      {isMobile ? (
                        <div className="space-y-3">
                          {invoiceLineItems.map((item, index) => {
                            const lineTotals = invoiceLineMeta.lineById.get(item.id);
                            return (
                              <div key={item.id} className="rounded-lg border border-border-subtle bg-bg-section/20 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-text-tertiary">Line {index + 1}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeInvoiceLineItem(item.id)}
                                    disabled={invoiceSaving}
                                  >
                                    Remove
                                  </Button>
                                </div>
                                <Input
                                  label="Description"
                                  placeholder="Description"
                                  value={item.description}
                                  onChange={(e) => updateInvoiceLineItem(item.id, { description: e.target.value })}
                                  onKeyDown={handleLineKeyDown}
                                  disabled={invoiceSaving}
                                />
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Input
                                    label="Quantity"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.quantity}
                                    onChange={(e) => updateInvoiceLineItem(item.id, { quantity: e.target.value })}
                                    onKeyDown={handleLineKeyDown}
                                    disabled={invoiceSaving}
                                  />
                                  <Input
                                    label="Unit price"
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    value={item.unitPrice}
                                    onChange={(e) => updateInvoiceLineItem(item.id, { unitPrice: e.target.value })}
                                    onKeyDown={handleLineKeyDown}
                                    disabled={invoiceSaving}
                                  />
                                </div>
                                <Select
                                  label="Tax"
                                  value={item.taxMode}
                                  onChange={(e) => {
                                    const nextMode = e.target.value as InvoiceLineDraft['taxMode'];
                                    updateInvoiceLineItem(item.id, {
                                      taxMode: nextMode,
                                      taxRate:
                                        nextMode === 'gst'
                                          ? String(DEFAULT_TAX_RATE)
                                          : nextMode === 'zero'
                                            ? '0'
                                            : item.taxRate,
                                    });
                                  }}
                                  disabled={invoiceSaving}
                                >
                                  <option value="zero">0%</option>
                                  <option value="gst">GST 10%</option>
                                  <option value="custom">Custom</option>
                                </Select>
                                {item.taxMode === 'custom' && (
                                  <Input
                                    label="Tax rate (%)"
                                    placeholder="%"
                                    inputMode="decimal"
                                    value={item.taxRate}
                                    onChange={(e) => updateInvoiceLineItem(item.id, { taxRate: e.target.value })}
                                    onKeyDown={handleLineKeyDown}
                                    disabled={invoiceSaving}
                                  />
                                )}
                                <Select
                                  label="Type"
                                  value={item.jobLinkType}
                                  onChange={(e) => updateInvoiceLineItem(item.id, { jobLinkType: e.target.value })}
                                  onKeyDown={handleLineKeyDown}
                                  disabled={invoiceSaving}
                                >
                                  {jobLinkOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                                <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-section/30 px-3 py-2">
                                  <span className="text-xs text-text-tertiary">Line total</span>
                                  <span className="text-sm font-semibold text-text-primary">
                                    {formatAmount(lineTotals?.totalCents ?? 0, invoiceCurrency)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          <Button variant="secondary" className="w-full" onClick={() => addInvoiceLineItem()} disabled={invoiceSaving}>
                            Add line item
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-lg border border-border-subtle overflow-hidden">
                            <div className="grid grid-cols-[minmax(240px,2.4fr)_minmax(96px,0.7fr)_minmax(120px,0.9fr)_minmax(180px,1.4fr)_minmax(140px,1fr)_minmax(140px,0.9fr)_auto] gap-4 bg-bg-section/70 px-4 py-3 text-xs font-semibold text-text-tertiary">
                              <span>Description</span>
                              <span>Qty</span>
                              <span>Unit</span>
                              <span>Tax</span>
                              <span>Type</span>
                              <span className="text-right">Line total</span>
                              <span />
                            </div>
                            <div className="divide-y divide-border-subtle">
                              {invoiceLineItems.map((item) => {
                                const lineTotals = invoiceLineMeta.lineById.get(item.id);
                                return (
                                  <div
                                    key={item.id}
                                    className="grid grid-cols-[minmax(240px,2.4fr)_minmax(96px,0.7fr)_minmax(120px,0.9fr)_minmax(180px,1.4fr)_minmax(140px,1fr)_minmax(140px,0.9fr)_auto] gap-4 px-4 py-3 items-center"
                                  >
                                    <input
                                      className="w-full rounded-md border border-border-subtle bg-bg-input px-4 py-2.5 text-sm text-text-primary"
                                      placeholder="Description"
                                      value={item.description}
                                      onChange={(e) => updateInvoiceLineItem(item.id, { description: e.target.value })}
                                      onKeyDown={handleLineKeyDown}
                                      disabled={invoiceSaving}
                                    />
                                    <input
                                      className="w-full min-w-[96px] rounded-md border border-border-subtle bg-bg-input px-4 py-2.5 text-sm text-text-primary"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.quantity}
                                      onChange={(e) => updateInvoiceLineItem(item.id, { quantity: e.target.value })}
                                      onKeyDown={handleLineKeyDown}
                                      disabled={invoiceSaving}
                                    />
                                    <input
                                      className="w-full min-w-[120px] rounded-md border border-border-subtle bg-bg-input px-4 py-2.5 text-sm text-text-primary"
                                      placeholder="0.00"
                                      inputMode="decimal"
                                      value={item.unitPrice}
                                      onChange={(e) => updateInvoiceLineItem(item.id, { unitPrice: e.target.value })}
                                      onKeyDown={handleLineKeyDown}
                                      disabled={invoiceSaving}
                                    />
                                    <div className="flex items-center gap-2">
                                      <select
                                        className="w-full min-w-[120px] rounded-md border border-border-subtle bg-bg-input px-4 py-2.5 text-sm text-text-primary"
                                        value={item.taxMode}
                                        onChange={(e) => {
                                          const nextMode = e.target.value as InvoiceLineDraft['taxMode'];
                                          updateInvoiceLineItem(item.id, {
                                            taxMode: nextMode,
                                            taxRate: nextMode === 'gst' ? String(DEFAULT_TAX_RATE) : nextMode === 'zero' ? '0' : item.taxRate,
                                          });
                                        }}
                                        disabled={invoiceSaving}
                                      >
                                        <option value="zero">0%</option>
                                        <option value="gst">GST 10%</option>
                                        <option value="custom">Custom</option>
                                      </select>
                                      {item.taxMode === 'custom' && (
                                        <input
                                          className="w-24 rounded-md border border-border-subtle bg-bg-input px-3 py-2.5 text-sm text-text-primary"
                                          placeholder="%"
                                          inputMode="decimal"
                                          value={item.taxRate}
                                          onChange={(e) => updateInvoiceLineItem(item.id, { taxRate: e.target.value })}
                                          onKeyDown={handleLineKeyDown}
                                          disabled={invoiceSaving}
                                        />
                                      )}
                                    </div>
                                    <select
                                      className="w-full min-w-[140px] rounded-md border border-border-subtle bg-bg-input px-4 py-2.5 text-sm text-text-primary"
                                      value={item.jobLinkType}
                                      onChange={(e) => updateInvoiceLineItem(item.id, { jobLinkType: e.target.value })}
                                      onKeyDown={handleLineKeyDown}
                                      disabled={invoiceSaving}
                                    >
                                      {jobLinkOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="text-right text-sm font-medium text-text-primary">
                                      {formatAmount(lineTotals?.totalCents ?? 0, invoiceCurrency)}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeInvoiceLineItem(item.id)}
                                      disabled={invoiceSaving}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-text-tertiary">
                            <span>Press Enter to add another line.</span>
                            <Button variant="ghost" size="sm" onClick={() => addInvoiceLineItem()} disabled={invoiceSaving}>
                              Add line item
                            </Button>
                          </div>
                        </>
                      )}
                    </section>

                    <aside className={cn('rounded-lg border border-border-subtle bg-bg-section/30 p-4 space-y-4', isMobile && 'p-5 space-y-3')}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-primary">Totals</h4>
                        <Badge className="bg-bg-section/80 text-text-tertiary">{invoiceCurrency}</Badge>
                      </div>
                      <div className={cn('space-y-2 text-sm', isMobile && 'text-base')}>
                        <div className="flex items-center justify-between">
                          <span className="text-text-tertiary">Subtotal</span>
                          <span className="font-medium text-text-primary">{formatAmount(invoiceLineMeta.subtotalCents, invoiceCurrency)}</span>
                        </div>
                        {(() => {
                          const entries = Array.from(invoiceLineMeta.taxByRate.entries()).sort(([a], [b]) => a - b);
                          if (entries.length === 0) {
                            entries.push([0, 0]);
                          }
                          return entries.map(([rate, cents]) => (
                            <div key={rate} className="flex items-center justify-between text-xs text-text-tertiary">
                              <span>{rate === DEFAULT_TAX_RATE ? `GST ${DEFAULT_TAX_RATE}%` : `Tax ${rate}%`}</span>
                              <span className="text-text-primary">{formatAmount(cents, invoiceCurrency)}</span>
                            </div>
                          ));
                        })()}
                        <div className="h-px bg-border-subtle" />
                        <div className={cn('flex items-center justify-between font-semibold text-text-primary', isMobile ? 'text-lg' : 'text-base')}>
                          <span>Total</span>
                          <span>{formatAmount(invoiceLineMeta.totalCents, invoiceCurrency)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-text-tertiary">Totals are recalculated on save.</p>
                    </aside>
                  </div>
                </div>

                <div className={cn('border-t border-border-subtle p-4 md:p-6 flex items-center justify-between', isMobile && 'flex-col gap-3 items-stretch')}>
                  <p className="text-xs text-text-tertiary">Drafts can be edited; issued invoices are locked.</p>
                  <div className={cn('flex items-center gap-2', isMobile && 'flex-col items-stretch')}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void previewInvoiceDraft()}
                      disabled={invoiceSaving}
                      className={cn(isMobile && 'w-full')}
                    >
                      Preview
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setShowInvoiceBuilder(false)} disabled={invoiceSaving} className={cn(isMobile && 'w-full')}>
                      Cancel
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void submitInvoice('draft')}
                      disabled={invoiceSaving}
                      className={cn(isMobile && 'w-full')}
                    >
                      {invoiceSaving ? 'Saving...' : 'Save as Draft'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void submitInvoice('issue')}
                      disabled={invoiceSaving}
                      className={cn(isMobile && 'w-full')}
                    >
                      {invoiceSaving ? 'Issuing...' : 'Issue Invoice'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPaymentModal(false)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-md'
              )}
              {...paymentSwipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">Record payment</h3>
                    <p className="text-xs text-text-tertiary mt-1">Log an external payment against this invoice.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setShowPaymentModal(false)} disabled={paymentSaving}>
                    Close
                  </Button>
                </div>

                {paymentError && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                    {paymentError}
                  </div>
                )}

                <Input
                  label="Amount"
                  placeholder="e.g. 1250.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  disabled={paymentSaving}
                />
                <Select
                  label="Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={paymentSaving}
                >
                  <option value="eft">EFT</option>
                  <option value="cash">Cash</option>
                  <option value="pos">POS</option>
                  <option value="cheque">Cheque</option>
                  <option value="xero">Xero</option>
                  <option value="other">Other</option>
                </Select>
                <Input
                  label="Paid at"
                  type="datetime-local"
                  value={paymentPaidAt}
                  onChange={(e) => setPaymentPaidAt(e.target.value)}
                  disabled={paymentSaving}
                />
                <Input
                  label="Reference"
                  placeholder="Bank ref or receipt ID"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  disabled={paymentSaving}
                />
                <Textarea
                  label="Notes"
                  placeholder="Optional notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  disabled={paymentSaving}
                />

                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void submitPayment()} disabled={paymentSaving}>
                    {paymentSaving ? 'Recording...' : 'Record payment'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </Card>
  );
}
