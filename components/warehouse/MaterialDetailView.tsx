'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatQuantity, toNumber } from '@/lib/utils/quantity';

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
  currentStock: number;
  allocated: number;
  available: number;
  avgDailyUsage30d: number;
  usageTrendPercent30d: number | null;
};

type UsagePoint = { day: string; totalUsed: number };

function badgeFor(m: MaterialRow): { label: string; variant: 'default' | 'gold' | 'muted' } {
  const threshold = m.reorderThreshold == null ? null : toNumber(m.reorderThreshold);
  if (threshold === null) return { label: 'Healthy', variant: 'default' };
  if (m.available <= 0) return { label: 'Critical', variant: 'gold' };
  if (m.available < threshold) return { label: 'Low', variant: 'muted' };
  return { label: 'Healthy', variant: 'default' };
}

function formatUnitCost(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return '--';
  return `AUD ${(Number(value) / 100).toFixed(2)}`;
}

export default function MaterialDetailView({ orgId, materialId }: { orgId: string; materialId: string }) {
  const [material, setMaterial] = useState<MaterialRow | null>(null);
  const [usage, setUsage] = useState<UsagePoint[] | null>(null);
  const [events, setEvents] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 30 | 180>(30);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mRes, uRes, eRes] = await Promise.all([
        fetch(`/api/materials?orgId=${orgId}`),
        fetch(`/api/materials/usage-series?orgId=${orgId}&materialId=${materialId}&days=${days}`),
        fetch(`/api/material-inventory-events?orgId=${orgId}&materialId=${materialId}&limit=50`),
      ]);

      const mJson = await mRes.json();
      const uJson = await uRes.json();
      const eJson = await eRes.json();

      if (!mRes.ok || !mJson?.ok) throw new Error(mJson?.error?.message || 'Failed to load material');
      const all = mJson.data as MaterialRow[];
      const found = all.find((x) => x.id === materialId) || null;
      if (!found) throw new Error('Material not found');
      setMaterial(found);

      if (uRes.ok && uJson?.ok) setUsage(uJson.data as UsagePoint[]);
      else setUsage([]);

      if (eRes.ok && eJson?.ok) setEvents(eJson.data as any[]);
      else setEvents([]);
    } catch (e) {
      setMaterial(null);
      setUsage([]);
      setEvents([]);
      setError(e instanceof Error ? e.message : 'Failed to load material');
    }
  }, [days, materialId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const max = useMemo(() => (usage ? Math.max(0, ...usage.map((p) => p.totalUsed)) : 0), [usage]);

  if (!material) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Card className="animate-pulse">
          <div className="h-4 w-1/2 rounded bg-bg-section/80" />
          <div className="mt-3 h-3 w-1/3 rounded bg-bg-section/80" />
        </Card>
      </div>
    );
  }

  const b = badgeFor(material);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{material.name}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {[material.category, material.unit].filter(Boolean).join(' • ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={b.variant}>{b.label}</Badge>
          <Link href="/warehouse">
            <Button variant="secondary" size="sm">
              Back
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-text-tertiary">Current stock</p>
            <p className="text-lg font-semibold text-text-primary">{formatQuantity(material.currentStock, material.unit)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Allocated (active jobs)</p>
            <p className="text-lg font-semibold text-text-primary">{formatQuantity(material.allocated, material.unit)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Available</p>
            <p className={cn('text-lg font-semibold', material.available < 0 ? 'text-red-400' : 'text-text-primary')}>
              {formatQuantity(material.available, material.unit)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-text-tertiary">Reorder threshold</p>
            <p className="text-sm text-text-secondary">
              {material.reorderThreshold == null ? 'Not set' : formatQuantity(material.reorderThreshold, material.unit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Reorder quantity</p>
            <p className="text-sm text-text-secondary">
              {material.reorderQuantity == null ? 'Not set' : formatQuantity(material.reorderQuantity, material.unit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Unit cost</p>
            <p className="text-sm text-text-secondary">{formatUnitCost(material.unitCostCents)}</p>
          </div>
        </div>
        {material.description && (
          <p className="mt-4 text-sm text-text-secondary whitespace-pre-wrap">{material.description}</p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Usage over time</h3>
            <p className="text-xs text-text-tertiary mt-1">Derived from usage logs (not allocations).</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={days === 7 ? 'primary' : 'secondary'} size="sm" onClick={() => setDays(7)}>
              7d
            </Button>
            <Button variant={days === 30 ? 'primary' : 'secondary'} size="sm" onClick={() => setDays(30)}>
              30d
            </Button>
            <Button variant={days === 180 ? 'primary' : 'secondary'} size="sm" onClick={() => setDays(180)}>
              6m
            </Button>
          </div>
        </div>

        {usage === null ? (
          <p className="text-sm text-text-secondary mt-4">Loading usage…</p>
        ) : usage.length === 0 ? (
          <p className="text-sm text-text-secondary mt-4">No usage logged yet.</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-end gap-1 h-24">
              {usage.map((p) => (
                <div
                  key={p.day}
                  className="flex-1 min-w-[2px] bg-accent-gold/40 hover:bg-accent-gold/60 transition-colors rounded-sm"
                  title={`${p.day}: ${formatQuantity(p.totalUsed, material.unit)}`}
                  style={{ height: `${max > 0 ? Math.max(2, (p.totalUsed / max) * 100) : 2}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-tertiary">
              Max day: {formatQuantity(max, material.unit)}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-text-primary">Recent inventory events</h3>
        <p className="text-xs text-text-tertiary mt-1">Every stock change is event-driven and auditable.</p>
        {events === null ? (
          <p className="text-sm text-text-secondary mt-4">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-text-secondary mt-4">No events yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {events.map((e: any) => (
              <div key={e.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{String(e.eventType)}</p>
                  <p className="text-[11px] text-text-tertiary">{new Date(e.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  {formatQuantity(e.quantity, material.unit)} {e.reason ? `- ${e.reason}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
