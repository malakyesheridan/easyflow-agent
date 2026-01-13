'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleSection, Button, Input, Select } from '@/components/ui';
import type { JobOrder } from '@/db/schema/job_orders';
import { formatQuantity } from '@/lib/utils/quantity';

type Draft = {
  supplier: string;
  item: string;
  quantity: string;
  unit: string;
  status: string;
  notes: string;
};

const EMPTY: Draft = { supplier: '', item: '', quantity: '', unit: '', status: 'pending', notes: '' };

export default function JobOrdersCard(props: { orgId: string; jobId: string }) {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = useMemo(() => orders.find((o) => o.id === editingId) || null, [editingId, orders]);
  const pendingCount = useMemo(
    () => orders.filter((order) => order.status === 'pending').length,
    [orders]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-orders?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load orders');
      setOrders(json.data as JobOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const beginEdit = (o: JobOrder) => {
    setEditingId(o.id);
    setDraft({
      supplier: o.supplier || '',
      item: o.item || '',
      quantity: o.quantity ? String(o.quantity) : '',
      unit: o.unit || '',
      status: o.status || 'pending',
      notes: o.notes || '',
    });
  };

  const save = async () => {
    if (!draft.item.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        orgId: props.orgId,
        ...(editingId ? { id: editingId } : { jobId: props.jobId }),
        supplier: draft.supplier.trim() || null,
        item: draft.item.trim(),
        quantity: draft.quantity.trim() ? Number(draft.quantity.trim()) : null,
        unit: draft.unit.trim() || null,
        status: draft.status.trim() || 'pending',
        notes: draft.notes.trim() || null,
      };

      const res = await fetch('/api/job-orders', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to save order');
      beginCreate();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (o: JobOrder) => {
    if (!confirm(`Remove order "${o.item}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-orders?id=${o.id}&orgId=${props.orgId}&jobId=${props.jobId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to delete order');
      await load();
      if (editingId === o.id) beginCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete order');
    } finally {
      setSaving(false);
    }
  };

  const summary = loading
    ? 'Loading orders...'
    : orders.length === 0
      ? 'No orders yet'
      : `${orders.length} orders (${pendingCount} pending)`;

  return (
    <CollapsibleSection
      title="Orders"
      description="Track material orders and status."
      summary={summary}
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-orders`}
      actions={
        <Button variant="secondary" size="sm" onClick={beginCreate} disabled={saving}>
          New order
        </Button>
      }
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-text-secondary">No orders yet.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {orders.map((o) => (
            <div key={o.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{o.item}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {[o.supplier, o.status].filter(Boolean).join(' • ') || '-'}
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  {o.quantity == null ? 'Qty: -' : `Qty: ${formatQuantity(o.quantity, o.unit || null)}`}
                </p>
                {o.notes && <p className="text-xs text-text-tertiary mt-1">{o.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => beginEdit(o)} disabled={saving}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(o)} disabled={saving}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">{editing ? 'Edit order' : 'Add order'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Item" value={draft.item} onChange={(e) => setDraft((p) => ({ ...p, item: e.target.value }))} disabled={saving} />
          <Input placeholder="Supplier (optional)" value={draft.supplier} onChange={(e) => setDraft((p) => ({ ...p, supplier: e.target.value }))} disabled={saving} />
          <Input placeholder="Quantity (optional)" inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft((p) => ({ ...p, quantity: e.target.value.replace(/[^\d.]/g, '') }))} disabled={saving} />
          <Input placeholder="Unit (optional)" value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))} disabled={saving} />
          <Select value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))} disabled={saving}>
            <option value="pending">Pending</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Input placeholder="Notes (optional)" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} disabled={saving} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={saving || !draft.item.trim()}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add order'}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={beginCreate} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
