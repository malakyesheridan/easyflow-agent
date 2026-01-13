'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, CollapsibleSection, Input, Select } from '@/components/ui';
import type { Job } from '@/db/schema/jobs';
import { cn } from '@/lib/utils';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobProfitability = {
  jobId: string;
  revenue: {
    actualCents: number | null;
    estimatedCents: number | null;
    overrideCents: number | null;
    effectiveCents: number;
    source: string;
  };
  costs: {
    labourCents: number;
    materialCents: number;
    subcontractCents: number;
    otherCents: number;
    travelCents: number;
    totalCents: number;
  };
  profitCents: number;
  marginPercent: number | null;
  estimated: {
    revenueCents: number | null;
    costCents: number | null;
    profitCents: number | null;
    marginPercent: number | null;
    targetMarginPercent: number | null;
  };
  variance: {
    percent: number | null;
    costPercent: number | null;
  };
  status: 'healthy' | 'warning' | 'critical';
  lastComputedAt: string;
  inputs: {
    labourMinutes: number;
    missingLabourRateCount: number;
    materialUsageCount: number;
    missingMaterialCostCount: number;
    manualCostCount: number;
    paymentsCount: number;
    invoicesCount: number;
    revenueSource: string;
  };
  settings: {
    marginWarningPercent: number;
    marginCriticalPercent: number;
    varianceThresholdPercent: number;
  };
};

type JobCostRow = {
  id: string;
  jobId: string;
  costType: string;
  description: string | null;
  quantity: any;
  unitCostCents: number | null;
  totalCostCents: number;
  createdAt: string;
};

function formatCurrency(cents: number | null): string {
  if (!Number.isFinite(cents ?? NaN)) return '--';
  return `AUD ${(Number(cents) / 100).toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return '--';
  return `${Number(value).toFixed(1)}%`;
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (hours <= 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function statusBadge(status: string): { label: string; className: string } {
  if (status === 'critical') return { label: 'Critical', className: 'bg-red-500/10 text-red-300' };
  if (status === 'warning') return { label: 'Warning', className: 'bg-amber-500/10 text-amber-300' };
  return { label: 'Healthy', className: 'bg-emerald-500/10 text-emerald-300' };
}

export default function JobProfitabilityCard({ job, orgId }: { job: Job; orgId: string }) {
  const router = useRouter();
  const [financials, setFinancials] = useState<JobProfitability | null>(null);
  const [costs, setCosts] = useState<JobCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estimatedRevenue, setEstimatedRevenue] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [targetMargin, setTargetMargin] = useState('');
  const [revenueOverride, setRevenueOverride] = useState('');

  const [costType, setCostType] = useState<'subcontract' | 'other' | 'travel' | 'labour' | 'material'>('subcontract');
  const [costDescription, setCostDescription] = useState('');
  const [costQuantity, setCostQuantity] = useState('');
  const [costUnitCost, setCostUnitCost] = useState('');
  const [costTotal, setCostTotal] = useState('');
  const [editingCostId, setEditingCostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [finRes, costRes] = await Promise.all([
        fetch(`/api/job-financials?orgId=${orgId}&jobId=${job.id}`),
        fetch(`/api/job-costs?orgId=${orgId}&jobId=${job.id}`),
      ]);
      const finJson = (await finRes.json()) as ApiResponse<JobProfitability>;
      const costJson = (await costRes.json()) as ApiResponse<JobCostRow[]>;
      if (!finRes.ok || !finJson.ok) throw new Error(finJson.ok ? 'Failed to load profitability' : finJson.error?.message || 'Failed to load profitability');
      if (!costRes.ok || !costJson.ok) throw new Error(costJson.ok ? 'Failed to load costs' : costJson.error?.message || 'Failed to load costs');
      setFinancials(finJson.data);
      setCosts(costJson.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profitability');
      setFinancials(null);
    } finally {
      setLoading(false);
    }
  }, [job.id, orgId]);

  useEffect(() => {
    setEstimatedRevenue(Number.isFinite(job.estimatedRevenueCents ?? NaN) ? ((job.estimatedRevenueCents ?? 0) / 100).toFixed(2) : '');
    setEstimatedCost(Number.isFinite(job.estimatedCostCents ?? NaN) ? ((job.estimatedCostCents ?? 0) / 100).toFixed(2) : '');
    const targetValue =
      job.targetMarginPercent === null || job.targetMarginPercent === undefined
        ? null
        : Number(job.targetMarginPercent);
    setTargetMargin(targetValue !== null && Number.isFinite(targetValue) ? String(targetValue) : '');
    setRevenueOverride(Number.isFinite(job.revenueOverrideCents ?? NaN) ? ((job.revenueOverrideCents ?? 0) / 100).toFixed(2) : '');
  }, [job.estimatedCostCents, job.estimatedRevenueCents, job.revenueOverrideCents, job.targetMarginPercent]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    router.refresh();
  };

  const saveEstimates = async () => {
    setSaving(true);
    setError(null);
    try {
      const estimatedRevenueValue = estimatedRevenue.trim() ? Number(estimatedRevenue) : null;
      const estimatedCostValue = estimatedCost.trim() ? Number(estimatedCost) : null;
      const targetMarginValue = targetMargin.trim() ? Number(targetMargin) : null;
      const revenueOverrideValue = revenueOverride.trim() ? Number(revenueOverride) : null;

      if (estimatedRevenueValue !== null && (!Number.isFinite(estimatedRevenueValue) || estimatedRevenueValue < 0)) {
        throw new Error('Estimated revenue must be a positive number.');
      }
      if (estimatedCostValue !== null && (!Number.isFinite(estimatedCostValue) || estimatedCostValue < 0)) {
        throw new Error('Estimated cost must be a positive number.');
      }
      if (targetMarginValue !== null && (!Number.isFinite(targetMarginValue) || targetMarginValue < 0)) {
        throw new Error('Target margin must be a positive number.');
      }
      if (revenueOverrideValue !== null && (!Number.isFinite(revenueOverrideValue) || revenueOverrideValue < 0)) {
        throw new Error('Revenue override must be a positive number.');
      }

      const payload = {
        id: job.id,
        orgId,
        estimatedRevenueCents: estimatedRevenueValue === null ? null : Math.round(estimatedRevenueValue * 100),
        estimatedCostCents: estimatedCostValue === null ? null : Math.round(estimatedCostValue * 100),
        targetMarginPercent: targetMarginValue === null ? null : targetMarginValue,
        revenueOverrideCents: revenueOverrideValue === null ? null : Math.round(revenueOverrideValue * 100),
      };
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to save estimates');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save estimates');
    } finally {
      setSaving(false);
    }
  };

  const resetCostForm = () => {
    setEditingCostId(null);
    setCostType('subcontract');
    setCostDescription('');
    setCostQuantity('');
    setCostUnitCost('');
    setCostTotal('');
  };

  const saveCost = async () => {
    const quantityValue = costQuantity.trim() ? Number(costQuantity) : null;
    const unitCostValue = costUnitCost.trim() ? Number(costUnitCost) : null;
    const totalCostValue = costTotal.trim() ? Number(costTotal) : null;
    if (quantityValue !== null && (!Number.isFinite(quantityValue) || quantityValue <= 0)) {
      setError('Cost quantity must be a positive number.');
      return;
    }
    if (unitCostValue !== null && (!Number.isFinite(unitCostValue) || unitCostValue < 0)) {
      setError('Unit cost must be a positive number.');
      return;
    }
    if (totalCostValue !== null && (!Number.isFinite(totalCostValue) || totalCostValue < 0)) {
      setError('Total cost must be a positive number.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        orgId,
        jobId: job.id,
        costType,
        description: costDescription.trim() || null,
        quantity: quantityValue,
        unitCostCents: unitCostValue === null ? null : Math.round(unitCostValue * 100),
        totalCostCents: totalCostValue === null ? null : Math.round(totalCostValue * 100),
      };
      const res = await fetch('/api/job-costs', {
        method: editingCostId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCostId ? { ...body, id: editingCostId } : body),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to save cost');
      resetCostForm();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save cost');
    } finally {
      setSaving(false);
    }
  };

  const editCost = (row: JobCostRow) => {
    setEditingCostId(row.id);
    setCostType((row.costType as any) || 'subcontract');
    setCostDescription(row.description ?? '');
    setCostQuantity(row.quantity != null ? String(row.quantity) : '');
    setCostUnitCost(Number.isFinite(row.unitCostCents ?? NaN) ? ((row.unitCostCents ?? 0) / 100).toFixed(2) : '');
    setCostTotal(Number.isFinite(row.totalCostCents ?? NaN) ? ((row.totalCostCents ?? 0) / 100).toFixed(2) : '');
  };

  const deleteCost = async (row: JobCostRow) => {
    if (!confirm('Delete this cost entry?')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-costs?orgId=${orgId}&id=${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to delete cost');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete cost');
    } finally {
      setSaving(false);
    }
  };

  const costTotalCents = financials?.costs.totalCents ?? 0;
  const revenueTotal = financials?.revenue.effectiveCents ?? 0;
  const costRatio = revenueTotal > 0 ? Math.min(1, costTotalCents / revenueTotal) : costTotalCents > 0 ? 1 : 0;
  const profitRatio = revenueTotal > 0 ? Math.max(0, 1 - costRatio) : 0;

  const breakdown = useMemo(() => {
    if (!financials) return [];
    return [
      { label: 'Labour', value: financials.costs.labourCents },
      { label: 'Materials', value: financials.costs.materialCents },
      { label: 'Subcontract', value: financials.costs.subcontractCents },
      { label: 'Other', value: financials.costs.otherCents + financials.costs.travelCents },
    ];
  }, [financials]);

  const varianceDisplay = financials?.variance.percent ?? null;
  const varianceDirection = varianceDisplay === null ? 'flat' : varianceDisplay >= 0 ? 'up' : 'down';
  const varianceText =
    varianceDisplay === null ? '--' : `${varianceDisplay >= 0 ? '+' : ''}${varianceDisplay.toFixed(1)}% vs estimate`;

  const badge = financials ? statusBadge(financials.status) : statusBadge('healthy');

  const explanation = financials
    ? `Revenue source: ${financials.inputs.revenueSource}. Labour: ${formatMinutes(financials.inputs.labourMinutes)}. Materials usage logs: ${financials.inputs.materialUsageCount}. Manual costs: ${financials.inputs.manualCostCount}.`
    : '';

  const summary = financials
    ? `Margin ${formatPercent(financials.marginPercent)} | Profit ${formatCurrency(financials.profitCents)}`
    : 'Loading profitability...';

  return (
    <CollapsibleSection
      title="Profitability"
      description="Live margin tracking and cost guardrails."
      summary={summary}
      defaultOpen={false}
      storageKey={`job-detail-${job.id}-profitability`}
      actions={<Badge className={badge.className}>{badge.label}</Badge>}
    >
      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading || !financials ? (
        <p className="text-sm text-text-secondary">Loading profitability...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-text-tertiary">Revenue ({financials.revenue.source})</p>
                <p className="text-lg font-semibold text-text-primary">{formatCurrency(financials.revenue.effectiveCents)}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-xs text-text-tertiary">Total cost</p>
                <p className="text-lg font-semibold text-text-primary">{formatCurrency(financials.costs.totalCents)}</p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-bg-input overflow-hidden">
              <div className="flex h-full w-full">
                <div className={cn('h-full', costRatio > 0.85 ? 'bg-red-500/60' : costRatio > 0.7 ? 'bg-amber-500/60' : 'bg-emerald-500/50')} style={{ width: `${costRatio * 100}%` }} />
                <div className="h-full bg-emerald-500/20" style={{ width: `${profitRatio * 100}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <span>Profit {formatCurrency(financials.profitCents)}</span>
              <span>Margin {formatPercent(financials.marginPercent)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              <p className="text-xs text-text-tertiary">Estimated revenue</p>
              <p className="text-sm font-semibold text-text-primary">{formatCurrency(financials.estimated.revenueCents)}</p>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              <p className="text-xs text-text-tertiary">Estimated cost</p>
              <p className="text-sm font-semibold text-text-primary">{formatCurrency(financials.estimated.costCents)}</p>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
              <p className="text-xs text-text-tertiary">Variance</p>
              <p className={cn('text-sm font-semibold', varianceDirection === 'down' ? 'text-red-400' : varianceDirection === 'up' ? 'text-emerald-400' : 'text-text-primary')}>
                {varianceText}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Cost breakdown</p>
              <span className="text-xs text-text-tertiary" title={explanation}>
                How calculated
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {breakdown.map((row) => {
                const pct = costTotalCents > 0 ? Math.min(100, Math.round((row.value / costTotalCents) * 100)) : 0;
                return (
                  <div key={row.label} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{row.label}</span>
                      <span className="font-medium text-text-primary">{formatCurrency(row.value)}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-bg-input overflow-hidden">
                      <div className="h-full bg-accent-gold/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {(financials.inputs.missingLabourRateCount > 0 || financials.inputs.missingMaterialCostCount > 0) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Missing rates: {financials.inputs.missingLabourRateCount} labour log(s), {financials.inputs.missingMaterialCostCount} material log(s).
            </div>
          )}
          {financials.revenue.source === 'none' && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Add an estimated revenue to compute margin and variance.
            </div>
          )}

          <p className="text-xs text-text-tertiary">
            Last computed {new Date(financials.lastComputedAt).toLocaleString()}
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-text-primary">Estimates and overrides</h3>
        <p className="text-xs text-text-tertiary mt-1">These inputs guide margin targets and variance checks.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            label="Estimated revenue"
            inputMode="decimal"
            value={estimatedRevenue}
            onChange={(e) => setEstimatedRevenue(e.target.value)}
            placeholder="e.g. 12000.00"
          />
          <Input
            label="Estimated cost"
            inputMode="decimal"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
            placeholder="e.g. 8000.00"
          />
          <Input
            label="Target margin (%)"
            inputMode="decimal"
            value={targetMargin}
            onChange={(e) => setTargetMargin(e.target.value)}
            placeholder="30"
          />
          <Input
            label="Revenue override"
            inputMode="decimal"
            value={revenueOverride}
            onChange={(e) => setRevenueOverride(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={saving} onClick={() => void saveEstimates()}>
            {saving ? 'Saving...' : 'Save estimates'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border-subtle pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Manual costs</h3>
            <p className="text-xs text-text-tertiary mt-1">Subcontractors, travel, and misc job expenses.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <Select label="Cost type" value={costType} onChange={(e) => setCostType(e.target.value as any)}>
            <option value="subcontract">Subcontract</option>
            <option value="other">Other</option>
            <option value="travel">Travel</option>
            <option value="labour">Labour</option>
            <option value="material">Material</option>
          </Select>
          <Input
            label="Description"
            value={costDescription}
            onChange={(e) => setCostDescription(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Quantity"
            inputMode="decimal"
            value={costQuantity}
            onChange={(e) => setCostQuantity(e.target.value)}
            placeholder="e.g. 1"
          />
          <Input
            label="Unit cost"
            inputMode="decimal"
            value={costUnitCost}
            onChange={(e) => setCostUnitCost(e.target.value)}
            placeholder="e.g. 500.00"
          />
          <Input
            label="Total cost"
            inputMode="decimal"
            value={costTotal}
            onChange={(e) => setCostTotal(e.target.value)}
            placeholder="Optional"
          />
          <div className="flex items-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void saveCost()} disabled={saving}>
              {saving ? 'Saving...' : editingCostId ? 'Save cost' : 'Add cost'}
            </Button>
            {editingCostId && (
              <Button variant="ghost" size="sm" onClick={resetCostForm} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {costs.length === 0 ? (
            <p className="text-sm text-text-secondary">No manual costs yet.</p>
          ) : (
            costs.map((row) => (
              <div key={row.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.description || row.costType}</p>
                    <p className="text-xs text-text-tertiary">
                      {row.quantity != null && row.unitCostCents != null
                        ? `${row.quantity} x ${formatCurrency(row.unitCostCents)}`
                        : 'Manual total'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{formatCurrency(row.totalCostCents)}</span>
                    <Button variant="ghost" size="sm" onClick={() => editCost(row)} disabled={saving}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteCost(row)} disabled={saving}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
