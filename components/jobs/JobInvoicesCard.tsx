'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card } from '@/components/ui';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobInvoiceRow = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  sentAt: string | null;
  paidAt: string | null;
  xeroStatus: string | null;
  xeroInvoiceUrl: string | null;
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

const statusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-bg-section/80 text-text-tertiary' },
  sent: { label: 'Sent', className: 'bg-amber-500/10 text-amber-300' },
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
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

export default function JobInvoicesCard(props: { orgId: string; jobId: string }) {
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [invoices, setInvoices] = useState<JobInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManageIntegrationState, setCanManageIntegrationState] = useState(false);

  const latest = invoices[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoiceRes, integrationsRes, sessionRes] = await Promise.all([
        fetch(`/api/job-invoices?orgId=${props.orgId}&jobId=${props.jobId}&limit=10`),
        fetch(`/api/integrations?orgId=${props.orgId}`),
        fetch('/api/auth/session'),
      ]);

      const invoiceJson = (await invoiceRes.json()) as ApiResponse<JobInvoiceRow[]>;
      const integrationsJson = (await integrationsRes.json()) as ApiResponse<IntegrationRow[]>;
      const sessionJson = (await sessionRes.json()) as ApiResponse<SessionPayload>;

      if (!invoiceRes.ok || !invoiceJson.ok) {
        throw new Error(invoiceJson.ok ? 'Failed to load invoices.' : invoiceJson.error?.message || 'Failed to load invoices.');
      }
      setInvoices(invoiceJson.data ?? []);

      if (sessionRes.ok && sessionJson.ok) {
        const caps = sessionJson.data?.actor?.capabilities ?? [];
        const canManageIntegrationsValue = caps.includes('admin') || caps.includes('manage_org');
        setCanManageIntegrationState(canManageIntegrationsValue);
        if (canManageIntegrationsValue && integrationsRes.ok && integrationsJson.ok) {
          const xero = (integrationsJson.data ?? []).find((row) => row.provider === 'xero') ?? null;
          setIntegration(xero);
        } else {
          setIntegration(null);
        }
      } else {
        setCanManageIntegrationState(false);
        setIntegration(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
      setInvoices([]);
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusBadge = useMemo(() => {
    if (!latest) return null;
    return statusMeta[latest.status] ?? statusMeta.draft;
  }, [latest]);

  const xeroBadge = useMemo(() => {
    if (!latest?.xeroStatus) return null;
    const key = latest.xeroStatus.toUpperCase();
    return xeroStatusMeta[key] ?? null;
  }, [latest?.xeroStatus]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Invoices</h2>
          <p className="text-xs text-text-tertiary mt-1">Xero invoice drafts and status.</p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge && <Badge className={statusBadge.className}>{statusBadge.label}</Badge>}
          {xeroBadge && <Badge className={xeroBadge.className}>{xeroBadge.label}</Badge>}
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading invoices...</p>
      ) : latest ? (
        <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
          <p className="text-sm font-medium text-text-primary">
            {formatAmount(latest.amountCents, latest.currency)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Created {new Date(latest.createdAt).toLocaleString()}
            {latest.sentAt ? ` | Sent ${new Date(latest.sentAt).toLocaleString()}` : ''}
            {latest.paidAt ? ` | Paid ${new Date(latest.paidAt).toLocaleString()}` : ''}
          </p>
          {latest.xeroInvoiceUrl && (
            <button
              type="button"
              className="mt-2 text-xs text-accent-gold hover:text-accent-gold/80"
              onClick={() => window.open(latest.xeroInvoiceUrl ?? '', '_blank')}
            >
              View in Xero
            </button>
          )}
        </div>
      ) : canManageIntegrationState && (!integration || integration.status !== 'connected') ? (
        <p className="text-sm text-text-secondary">
          Xero is not connected. Connect it in Settings to enable invoices.
        </p>
      ) : canManageIntegrationState && integration && !integration.enabled ? (
        <p className="text-sm text-text-secondary">
          Xero is connected but disabled. Enable it in Settings to create invoices.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">No invoices yet.</p>
      )}
    </Card>
  );
}
