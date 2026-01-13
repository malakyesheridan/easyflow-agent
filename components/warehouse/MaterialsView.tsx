'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Input, Badge } from '@/components/ui';
import QuickActionsMenu from '@/components/quick-actions/QuickActionsMenu';
import { cn } from '@/lib/utils';
import { formatQuantity, toNumber } from '@/lib/utils/quantity';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';

type MaterialRow = {
  id: string;
  orgId: string;
  name: string;
  category: string | null;
  unit: string;
  imageUrl: string | null;
  description: string | null;
  reorderThreshold: string | null;
  reorderQuantity: string | null;
  unitCostCents: number | null;
  createdAt: string;
  updatedAt: string;
  currentStock: number;
  allocated: number;
  available: number;
  avgDailyUsage30d: number;
  usage30dTotal: number;
  usageTrendPercent30d: number | null;
  lastStocktakeAt: string | null;
};

type IntegrationEventRow = {
  id: string;
  provider: string;
  eventType: string;
  actionType: string;
  status: string;
  payload: any;
  createdAt: string;
};

type DraftMaterial = {
  name: string;
  category: string;
  unit: string;
  unitCost: string;
  reorderThreshold: string;
  reorderQuantity: string;
  imageUrl: string;
  description: string;
};

const EMPTY: DraftMaterial = {
  name: '',
  category: '',
  unit: '',
  unitCost: '',
  reorderThreshold: '',
  reorderQuantity: '',
  imageUrl: '',
  description: '',
};

function statusBadge(material: MaterialRow): { label: string; variant: 'default' | 'gold' | 'muted' } {
  const threshold = material.reorderThreshold == null ? null : toNumber(material.reorderThreshold);
  if (threshold === null) return { label: 'Healthy', variant: 'default' };
  if (material.available <= 0) return { label: 'Critical', variant: 'gold' };
  if (material.available < threshold) return { label: 'Low', variant: 'muted' };
  return { label: 'Healthy', variant: 'default' };
}

function Trend({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-xs text-text-tertiary">—</span>;
  }
  const up = value >= 0;
  const text = `${up ? '↑' : '↓'} ${Math.abs(value).toFixed(0)}%`;
  return (
    <span className={cn('text-xs font-medium', up ? 'text-emerald-400' : 'text-red-400')}>
      {text}
    </span>
  );
}

export default function MaterialsView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const resolvedOrgId = orgId || config?.orgId || '';
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [inventoryEvents, setInventoryEvents] = useState<IntegrationEventRow[]>([]);
  const [syncByMaterialId, setSyncByMaterialId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftMaterial>(EMPTY);
  const [stockModalMaterialId, setStockModalMaterialId] = useState<string | null>(null);
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('');
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(() => setStockModalMaterialId(null), isMobile);

  const editingMaterial = useMemo(
    () => (materials ? materials.find((m) => m.id === editingId) || null : null),
    [materials, editingId]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mRes, aRes, iRes] = await Promise.all([
        fetch(`/api/materials?orgId=${resolvedOrgId}`),
        fetch(`/api/material-alerts?orgId=${resolvedOrgId}&limit=20`),
        fetch(`/api/warehouse/integration-activity?orgId=${resolvedOrgId}&limit=50`),
      ]);

      const mJson = await mRes.json();
      const aJson = await aRes.json();
      const iJson = await iRes.json();

      if (!mRes.ok || !mJson?.ok) throw new Error(mJson?.error?.message || 'Failed to load materials');
      setMaterials(mJson.data as MaterialRow[]);

      if (aRes.ok && aJson?.ok) setAlerts(aJson.data as any[]);
      else setAlerts([]);

      if (iRes.ok && iJson?.ok) {
        const events = (iJson.data as IntegrationEventRow[]) ?? [];
        setInventoryEvents(events);
        const map: Record<string, string> = {};
        for (const event of events) {
          const payload = event?.payload?.event ?? event?.payload ?? {};
          const materialIds: string[] = [];
          if (typeof payload.materialId === 'string') materialIds.push(payload.materialId);
          if (Array.isArray(payload.materials)) {
            for (const item of payload.materials) {
              if (item && typeof item.materialId === 'string') materialIds.push(item.materialId);
            }
          }
          if (Array.isArray(payload.materialAllocations)) {
            for (const item of payload.materialAllocations) {
              if (item && typeof item.materialId === 'string') materialIds.push(item.materialId);
            }
          }
          for (const materialId of materialIds) {
            if (!map[materialId]) {
              map[materialId] = event.createdAt;
            } else if (new Date(event.createdAt).getTime() > new Date(map[materialId]).getTime()) {
              map[materialId] = event.createdAt;
            }
          }
        }
        setSyncByMaterialId(map);
      } else {
        setInventoryEvents([]);
        setSyncByMaterialId({});
      }
    } catch (e) {
      setMaterials([]);
      setAlerts([]);
      setInventoryEvents([]);
      setSyncByMaterialId({});
      setError(e instanceof Error ? e.message : 'Failed to load materials');
    }
  }, [resolvedOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const beginEdit = (m: MaterialRow) => {
    setEditingId(m.id);
    setDraft({
      name: m.name || '',
      category: m.category || '',
      unit: m.unit || '',
      unitCost: Number.isFinite(m.unitCostCents ?? NaN) ? ((m.unitCostCents ?? 0) / 100).toFixed(2) : '',
      reorderThreshold: m.reorderThreshold ?? '',
      reorderQuantity: m.reorderQuantity ?? '',
      imageUrl: m.imageUrl || '',
      description: m.description || '',
    });
  };

  const saveMaterial = async () => {
    if (!draft.name.trim() || !draft.unit.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        orgId: resolvedOrgId,
        name: draft.name.trim(),
        category: draft.category.trim() || null,
        unit: draft.unit.trim(),
        imageUrl: draft.imageUrl.trim() || null,
        description: draft.description.trim() || null,
      };

      const threshold = draft.reorderThreshold.trim();
      if (threshold) body.reorderThreshold = Number(threshold);
      else body.reorderThreshold = null;

      const reorderQty = draft.reorderQuantity.trim();
      if (reorderQty) body.reorderQuantity = Number(reorderQty);
      else body.reorderQuantity = null;

      const unitCostValue = draft.unitCost.trim();
      if (unitCostValue) {
        const parsed = Number(unitCostValue);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Unit cost must be a positive number');
        body.unitCostCents = Math.round(parsed * 100);
      } else {
        body.unitCostCents = null;
      }

      const res = await fetch('/api/materials', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...body, id: editingId } : body),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to save material');
      beginCreate();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save material');
    } finally {
      setSaving(false);
    }
  };

  const deleteMaterial = async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.name}"? This removes its allocations, logs, and events.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials?orgId=${resolvedOrgId}&id=${m.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to delete material');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete material');
    } finally {
      setSaving(false);
    }
  };

  const openStockModal = (materialId: string) => {
    setStockModalMaterialId(materialId);
    setStockDelta('');
    setStockReason('');
  };

  const submitStockEvent = async () => {
    if (!stockModalMaterialId) return;
    const delta = Number(stockDelta);
    if (!Number.isFinite(delta) || delta === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/material-inventory-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: resolvedOrgId,
          materialId: stockModalMaterialId,
          eventType: delta > 0 ? 'stock_added' : 'manual_adjustment',
          quantity: delta,
          reason: stockReason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to add stock event');
      setStockModalMaterialId(null);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add stock event');
    } finally {
      setSaving(false);
    }
  };

  if (materials === null) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse">
          <div className="h-4 w-1/3 rounded bg-bg-section/80" />
          <div className="mt-2 h-3 w-1/2 rounded bg-bg-section/80" />
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 w-2/3 rounded bg-bg-section/80" />
              <div className="mt-3 h-3 w-1/2 rounded bg-bg-section/80" />
              <div className="mt-6 h-8 w-full rounded bg-bg-section/80" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alerts && alerts.length > 0 && (
        <Card className="border border-accent-gold/30 bg-accent-gold/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {config?.vocabulary?.materialPlural ?? 'Materials'} alerts
              </p>
              <p className="text-xs text-text-tertiary mt-1">Resolve by updating stock or allocations.</p>
            </div>
            <Badge variant="gold">{alerts.length}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {alerts.slice(0, 3).map((a: any) => (
              <div key={a.id} className="text-sm text-text-secondary">
                {a.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="bg-bg-section/30 border border-border-subtle">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Inventory automation</p>
            <p className="text-xs text-text-tertiary mt-1">Recent inventory sync and reorder activity.</p>
          </div>
          <Badge variant="muted">{inventoryEvents.length}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {inventoryEvents.length === 0 ? (
            <p className="text-xs text-text-tertiary">No recent automation events.</p>
          ) : (
            inventoryEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="text-xs text-text-secondary">
                {event.eventType} → {event.actionType} · {new Date(event.createdAt).toLocaleString()}
              </div>
            ))
          )}
        </div>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card id="warehouse-material-form">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {config?.vocabulary?.materialPlural ?? 'Materials'}
            </h2>
            <p className="text-xs text-text-tertiary mt-1">Definitions, stock, allocations, and usage signals.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={beginCreate} disabled={saving}>
            New {config?.vocabulary?.materialSingular?.toLowerCase() ?? 'material'}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="Name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder={`Unit (e.g. ${config?.units?.materialDefaultUnit ?? 'units'})`}
            value={draft.unit}
            onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Unit cost (optional, e.g. 24.50)"
            inputMode="decimal"
            value={draft.unitCost}
            onChange={(e) => setDraft((p) => ({ ...p, unitCost: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Category (optional)"
            value={draft.category}
            onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Reorder threshold (optional)"
            value={draft.reorderThreshold}
            onChange={(e) => setDraft((p) => ({ ...p, reorderThreshold: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Reorder quantity (optional)"
            value={draft.reorderQuantity}
            onChange={(e) => setDraft((p) => ({ ...p, reorderQuantity: e.target.value }))}
            disabled={saving}
          />
          <Input
            placeholder="Image URL (optional)"
            value={draft.imageUrl}
            onChange={(e) => setDraft((p) => ({ ...p, imageUrl: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="mt-3">
          <Input
            placeholder="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            disabled={saving}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={() => void saveMaterial()} disabled={saving || !draft.name.trim() || !draft.unit.trim()}>
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create material'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={beginCreate} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      {materials.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">
            No {config?.vocabulary?.materialPlural?.toLowerCase() ?? 'materials'} yet.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {materials.map((m) => {
            const s = statusBadge(m);
            const lastSync = syncByMaterialId[m.id] ?? null;
            return (
              <Card key={m.id} className="bg-bg-section/30 border border-border-subtle">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-text-primary truncate">{m.name}</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {[m.category, m.unit].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuickActionsMenu entity={m} entityType="material" orgId={resolvedOrgId} />
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] text-text-tertiary">Stock</p>
                    <p className="text-sm font-medium text-text-primary">{formatQuantity(m.currentStock, m.unit)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary">Allocated</p>
                    <p className="text-sm font-medium text-text-primary">{formatQuantity(m.allocated, m.unit)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary">Available</p>
                    <p className={cn('text-sm font-medium', m.available < 0 ? 'text-red-400' : 'text-text-primary')}>
                      {formatQuantity(m.available, m.unit)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-text-tertiary">Avg usage (30d)</p>
                    <p className="text-sm font-medium text-text-primary">{formatQuantity(m.avgDailyUsage30d, m.unit)}/day</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary">Trend</p>
                    <Trend value={m.usageTrendPercent30d} />
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[11px] text-text-tertiary">Last sync</p>
                  <p className="text-xs text-text-secondary">
                    {lastSync ? new Date(lastSync).toLocaleString() : 'Not synced'}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openStockModal(m.id)} disabled={saving}>
                      Adjust stock
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/warehouse/materials/${m.id}`)}>
                      Details
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => beginEdit(m)} disabled={saving}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteMaterial(m)} disabled={saving}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {stockModalMaterialId && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setStockModalMaterialId(null)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-xl'
              )}
              {...swipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">Stock adjustment</h3>
                    <p className="text-xs text-text-tertiary mt-1">Enter a positive number to add stock, negative to adjust down.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setStockModalMaterialId(null)} disabled={saving}>
                    Close
                  </Button>
                </div>
                <Input
                  placeholder="Quantity (e.g. 10 or -2.5)"
                  value={stockDelta}
                  onChange={(e) => setStockDelta(e.target.value)}
                  disabled={saving}
                />
                <Input
                  placeholder="Reason (optional)"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  disabled={saving}
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={() => void submitStockEvent()} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
