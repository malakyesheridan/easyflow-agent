'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobPaymentRow = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  paymentLinkUrl: string | null;
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

const statusMeta: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-300' },
  pending: { label: 'Pending', className: 'bg-amber-500/10 text-amber-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  cancelled: { label: 'Cancelled', className: 'bg-bg-section/80 text-text-tertiary' },
};

function formatAmount(amountCents: number, currency: string) {
  const amount = amountCents / 100;
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

function canManagePayments(payload: SessionPayload | null): boolean {
  const caps = payload?.actor?.capabilities ?? [];
  return caps.includes('admin') || caps.includes('manage_jobs') || caps.includes('manage_org');
}

function canManageIntegrations(payload: SessionPayload | null): boolean {
  const caps = payload?.actor?.capabilities ?? [];
  return caps.includes('admin') || caps.includes('manage_org');
}

export default function JobPaymentsCard(props: { orgId: string; jobId: string }) {
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [payments, setPayments] = useState<JobPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AUD');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canManageIntegrationState, setCanManageIntegrationState] = useState(false);
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(() => setShowModal(false), isMobile);

  const latest = payments[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsRes, integrationsRes, sessionRes] = await Promise.all([
        fetch(`/api/job-payments?orgId=${props.orgId}&jobId=${props.jobId}&limit=10`),
        fetch(`/api/integrations?orgId=${props.orgId}`),
        fetch('/api/auth/session'),
      ]);

      const paymentsJson = (await paymentsRes.json()) as ApiResponse<JobPaymentRow[]>;
      const integrationsJson = (await integrationsRes.json()) as ApiResponse<IntegrationRow[]>;
      const sessionJson = (await sessionRes.json()) as ApiResponse<SessionPayload>;

      if (!paymentsRes.ok || !paymentsJson.ok) {
        throw new Error(paymentsJson.ok ? 'Failed to load payments.' : paymentsJson.error?.message || 'Failed to load payments.');
      }
      setPayments(paymentsJson.data ?? []);

      if (sessionRes.ok && sessionJson.ok) {
        setCanManage(canManagePayments(sessionJson.data));
        const canManageIntegrationsValue = canManageIntegrations(sessionJson.data);
        setCanManageIntegrationState(canManageIntegrationsValue);
        if (canManageIntegrationsValue && integrationsRes.ok && integrationsJson.ok) {
          const stripe = (integrationsJson.data ?? []).find((row) => row.provider === 'stripe') ?? null;
          setIntegration(stripe);
        } else {
          setIntegration(null);
        }
      } else {
        setCanManage(false);
        setCanManageIntegrationState(false);
        setIntegration(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
      setPayments([]);
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setModalError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch('/api/job-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          amountCents: Math.round(amountValue * 100),
          currency,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? 'Failed to create payment link.' : json.error?.message || 'Failed to create payment link.');
      }
      setShowModal(false);
      setAmount('');
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Failed to create payment link.');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (!latest) return null;
    return statusMeta[latest.status] ?? statusMeta.pending;
  }, [latest]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Payments</h2>
          <p className="text-xs text-text-tertiary mt-1">Stripe payment links and status.</p>
        </div>
        {statusBadge && <Badge className={statusBadge.className}>{statusBadge.label}</Badge>}
      </div>

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading payments...</p>
      ) : latest ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {formatAmount(latest.amountCents, latest.currency)}
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  Created {new Date(latest.createdAt).toLocaleString()}
                  {latest.paidAt ? ` · Paid ${new Date(latest.paidAt).toLocaleString()}` : ''}
                </p>
              </div>
              {latest.paymentLinkUrl && latest.status === 'pending' ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigator.clipboard.writeText(latest.paymentLinkUrl ?? '')}
                  >
                    Copy link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(latest.paymentLinkUrl ?? '', '_blank')}>
                    Open checkout
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : canManageIntegrationState && (!integration || integration.status !== 'connected') ? (
        <p className="text-sm text-text-secondary">
          Stripe is not connected. Connect it in Settings to enable payments.
        </p>
      ) : canManageIntegrationState && integration && !integration.enabled ? (
        <p className="text-sm text-text-secondary">
          Stripe is connected but disabled. Enable it in Settings to collect payments.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">No payment links yet.</p>
      )}

      <div className="mt-4">
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowModal(true)}
            disabled={
              saving ||
              (canManageIntegrationState && (!integration || !integration.enabled || integration.status !== 'connected'))
            }
          >
            Collect payment
          </Button>
        )}
        {!canManage && (
          <p className="text-xs text-text-tertiary mt-2">You do not have permission to collect payments.</p>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-md'
              )}
              {...swipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">Collect payment</h3>
                    <p className="text-xs text-text-tertiary mt-1">Create a payment link for this job.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setShowModal(false)} disabled={saving}>
                    Close
                  </Button>
                </div>

                {modalError && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                    {modalError}
                  </div>
                )}

                <Input
                  label="Amount"
                  placeholder="e.g. 1250.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={saving}
                />
                <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={saving}>
                  <option value="AUD">AUD</option>
                  <option value="NZD">NZD</option>
                  <option value="USD">USD</option>
                </Select>

                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void handleCreate()} disabled={saving}>
                    {saving ? 'Creating...' : 'Create payment link'}
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
