'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleSection, Button, Input, Select, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatQuantity, toNumber } from '@/lib/utils/quantity';
import useIsMobile from '@/hooks/useIsMobile';

type MaterialListRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  reorderThreshold: string | null;
  currentStock: number;
  allocated: number;
  available: number;
};

type AllocationRow = {
  id: string;
  jobId: string;
  materialId: string;
  plannedQuantity: any;
  notes: string | null;
  materialName: string;
  materialUnit: string;
  materialCategory: string | null;
};

type UsageRow = {
  id: string;
  materialId: string;
  quantityUsed: any;
  notes: string | null;
  createdAt: string;
  materialName: string;
  materialUnit: string;
};

export default function JobMaterialsCard(props: { orgId: string; jobId: string }) {
  const isMobile = useIsMobile();
  const [materials, setMaterials] = useState<MaterialListRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [plannedQty, setPlannedQty] = useState('');
  const [plannedNotes, setPlannedNotes] = useState('');

  const [usageMaterialId, setUsageMaterialId] = useState<string>('');
  const [usageQty, setUsageQty] = useState('');
  const [usageNotes, setUsageNotes] = useState('');

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId) || null,
    [materials, selectedMaterialId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, aRes, uRes] = await Promise.all([
        fetch(`/api/materials?orgId=${props.orgId}`),
        fetch(`/api/job-material-allocations?orgId=${props.orgId}&jobId=${props.jobId}`),
        fetch(`/api/material-usage-logs?orgId=${props.orgId}&jobId=${props.jobId}&limit=50`),
      ]);
      const [mJson, aJson, uJson] = await Promise.all([mRes.json(), aRes.json(), uRes.json()]);
      if (!mRes.ok || !mJson?.ok) throw new Error(mJson?.error?.message || 'Failed to load materials');
      if (!aRes.ok || !aJson?.ok) throw new Error(aJson?.error?.message || 'Failed to load allocations');
      if (!uRes.ok || !uJson?.ok) throw new Error(uJson?.error?.message || 'Failed to load usage logs');

      setMaterials(mJson.data as MaterialListRow[]);
      setAllocations(aJson.data as AllocationRow[]);
      setUsage(uJson.data as UsageRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job materials');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!usageMaterialId && allocations.length > 0) setUsageMaterialId(allocations[0].materialId);
  }, [allocations, usageMaterialId]);

  const addAllocation = async () => {
    if (!selectedMaterialId) return;
    const qty = Number(plannedQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-material-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          materialId: selectedMaterialId,
          plannedQuantity: qty,
          notes: plannedNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to allocate material');
      setPlannedQty('');
      setPlannedNotes('');
      setSelectedMaterialId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to allocate material');
    } finally {
      setSaving(false);
    }
  };

  const deleteAllocation = async (id: string) => {
    if (!confirm('Remove this planned allocation?')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-material-allocations?orgId=${props.orgId}&id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to remove allocation');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove allocation');
    } finally {
      setSaving(false);
    }
  };

  const logUsage = async () => {
    if (!usageMaterialId) return;
    const qty = Number(usageQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/material-usage-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          materialId: usageMaterialId,
          quantityUsed: qty,
          notes: usageNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to log usage');
      setUsageQty('');
      setUsageNotes('');
      await load();
      setSuccess('Material usage logged');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log usage');
    } finally {
      setSaving(false);
    }
  };

  const allocationTotalByMaterialId = useMemo(() => {
    const map = new Map<string, number>();
    allocations.forEach((a) => {
      map.set(String(a.materialId), (map.get(String(a.materialId)) ?? 0) + toNumber(a.plannedQuantity));
    });
    return map;
  }, [allocations]);

  useEffect(() => {
    if (!isMobile) return;
    if (!usageMaterialId || usageQty) return;
    const planned = allocationTotalByMaterialId.get(String(usageMaterialId)) ?? 0;
    if (planned > 0) setUsageQty(String(planned));
  }, [allocationTotalByMaterialId, isMobile, usageMaterialId, usageQty]);

  const summary = loading
    ? 'Loading materials...'
    : `${allocations.length} items allocated, ${usage.length} used`;

  return (
    <CollapsibleSection
      title="Materials"
      description="Plan allocations and log actual usage (event-driven stock)."
      summary={summary}
      defaultOpen={!isMobile}
      storageKey={`job-detail-${props.jobId}-materials`}
    >
      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-sm text-emerald-300">
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading materials...</p>
      ) : isMobile ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
            <p className="text-sm font-semibold text-text-primary">Log material usage</p>
            <p className="text-xs text-text-tertiary mt-1">Defaults align with planned allocations.</p>
          </div>
          <div className="space-y-3">
            <Select
              id="usage-material-mobile"
              label="Material"
              value={usageMaterialId}
              onChange={(e) => {
                setUsageMaterialId(e.target.value);
                if (!usageQty) {
                  const planned = allocationTotalByMaterialId.get(String(e.target.value)) ?? 0;
                  if (planned > 0) setUsageQty(String(planned));
                }
              }}
              disabled={saving}
            >
              <option value="">Select</option>
              {(allocations.length > 0 ? allocations : materials).map((x: any) => {
                const id = x.materialId ?? x.id;
                const name = x.materialName ?? x.name;
                const unit = x.materialUnit ?? x.unit;
                return (
                  <option key={id} value={id}>
                    {name} ({unit})
                  </option>
                );
              })}
            </Select>
            <Input
              placeholder="Quantity used"
              value={usageQty}
              onChange={(e) => setUsageQty(e.target.value)}
              disabled={saving}
              inputMode="decimal"
              className="text-base py-3"
            />
            <Input
              placeholder="Notes (optional)"
              value={usageNotes}
              onChange={(e) => setUsageNotes(e.target.value)}
              disabled={saving}
              className="text-base py-3"
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={saving || !usageMaterialId}
            onClick={() => void logUsage()}
          >
            {saving ? 'Saving...' : 'Log usage'}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">Planned allocations</p>
            {allocations.length === 0 ? (
              <p className="text-sm text-text-secondary">No planned materials yet.</p>
            ) : (
              <div className="space-y-2">
                {allocations.map((a) => (
                  <div key={a.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{a.materialName}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          Planned: {formatQuantity(a.plannedQuantity, a.materialUnit)}
                          {a.notes ? ` - ${a.notes}` : ''}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => void deleteAllocation(a.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                id="material-select"
                label="Material"
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                disabled={saving}
              >
                <option value="">Select</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Planned quantity"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                disabled={saving}
              />
              <Input
                placeholder="Notes (optional)"
                value={plannedNotes}
                onChange={(e) => setPlannedNotes(e.target.value)}
                disabled={saving}
              />
            </div>
            {selectedMaterial && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-text-tertiary">
                  Stock: {formatQuantity(selectedMaterial.currentStock, selectedMaterial.unit)} - Allocated:{' '}
                  {formatQuantity(selectedMaterial.allocated, selectedMaterial.unit)} - Available:{' '}
                  <span className={cn(selectedMaterial.available < 0 ? 'text-red-400' : 'text-text-secondary')}>
                    {formatQuantity(selectedMaterial.available, selectedMaterial.unit)}
                  </span>
                </p>
                {selectedMaterial.reorderThreshold != null &&
                  selectedMaterial.available < toNumber(selectedMaterial.reorderThreshold) && (
                    <Badge variant="muted">Below threshold</Badge>
                  )}
              </div>
            )}
            <div className="mt-3">
              <Button variant="primary" size="sm" disabled={saving || !selectedMaterialId} onClick={() => void addAllocation()}>
                {saving ? 'Saving...' : 'Add allocation'}
              </Button>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-4">
            <p className="text-sm font-semibold text-text-primary mb-2">Log actual usage</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                id="usage-material"
                label="Material"
                value={usageMaterialId}
                onChange={(e) => setUsageMaterialId(e.target.value)}
                disabled={saving}
              >
                <option value="">Select</option>
                {(allocations.length > 0 ? allocations : materials).map((x: any) => {
                  const id = x.materialId ?? x.id;
                  const name = x.materialName ?? x.name;
                  const unit = x.materialUnit ?? x.unit;
                  const plannedTotal = allocationTotalByMaterialId.get(String(id)) ?? 0;
                  return (
                    <option key={id} value={id}>
                      {name} ({unit}){plannedTotal > 0 ? ` - planned ${plannedTotal}` : ''}
                    </option>
                  );
                })}
              </Select>
              <Input placeholder="Quantity used" value={usageQty} onChange={(e) => setUsageQty(e.target.value)} disabled={saving} />
              <Input placeholder="Notes (optional)" value={usageNotes} onChange={(e) => setUsageNotes(e.target.value)} disabled={saving} />
            </div>
            <div className="mt-3">
              <Button variant="primary" size="sm" disabled={saving || !usageMaterialId} onClick={() => void logUsage()}>
                {saving ? 'Saving...' : 'Log usage'}
              </Button>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-text-primary mb-2">Recent usage</p>
              {usage.length === 0 ? (
                <p className="text-sm text-text-secondary">No usage logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {usage.slice(0, 8).map((u) => (
                    <div key={u.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-primary">{u.materialName}</p>
                        <p className="text-[11px] text-text-tertiary">{new Date(u.createdAt).toLocaleString()}</p>
                      </div>
                      <p className="text-sm text-text-secondary mt-1">
                        {formatQuantity(u.quantityUsed, u.materialUnit)} {u.notes ? `- ${u.notes}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
