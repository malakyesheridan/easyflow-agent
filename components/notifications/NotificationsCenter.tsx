'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import { cn } from '@/lib/utils';

export type NotificationRow = {
  id: string;
  orgId: string;
  type: 'job_progress' | 'warehouse_alert' | 'announcement' | 'integration' | 'automation';
  jobId: string | null;
  eventKey: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type StatusFilter = 'all' | 'unread' | 'read';
type TypeFilter = 'all' | NotificationRow['type'];

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'job_progress', label: 'Jobs' },
  { id: 'warehouse_alert', label: 'Warehouse' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'integration', label: 'Integrations' },
  { id: 'automation', label: 'Automations' },
];

const TYPE_META: Record<NotificationRow['type'], { label: string; className: string }> = {
  job_progress: { label: 'Job', className: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  warehouse_alert: { label: 'Warehouse', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  announcement: { label: 'Announcement', className: 'bg-accent-gold/15 text-accent-gold border-accent-gold/30' },
  integration: { label: 'Integration', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  automation: { label: 'Automation', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <div className="h-4 w-3/4 rounded bg-bg-section/80" />
          <div className="mt-2 h-3 w-32 rounded bg-bg-section/80" />
        </Card>
      ))}
    </div>
  );
}

export default function NotificationsCenter({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const unreadCount = useMemo(() => (items ? items.filter((n) => !n.readAt).length : 0), [items]);

  const fetchItems = useCallback(async () => {
    try {
      setError(null);
      if (!orgId) {
        setItems([]);
        return;
      }
      const res = await fetch(`/api/notifications?orgId=${orgId}&limit=200`, { method: 'GET' });
      const json = (await res.json()) as ApiResponse<{ unreadCount: number; notifications?: NotificationRow[] }>;
      if (!res.ok || !json.ok) {
        setItems([]);
        setError('Failed to load notifications');
        return;
      }
      setItems(json.data.notifications ?? []);
    } catch {
      setItems([]);
      setError('Failed to load notifications');
    }
  }, [orgId]);

  const markAllRead = useCallback(async () => {
    try {
      setMarkingRead(true);
      if (!orgId) return;
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      await fetchItems();
    } finally {
      setMarkingRead(false);
    }
  }, [fetchItems, orgId]);

  const markOneRead = useCallback(async (id: string) => {
    if (markingId) return;
    if (!orgId) return;
    setMarkingId(id);
    setItems((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) : prev
    );
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, ids: [id] }),
      });
    } finally {
      setMarkingId(null);
    }
  }, [markingId, orgId]);

  const openNotification = useCallback(async (n: NotificationRow) => {
    if (!n.readAt) {
      await markOneRead(n.id);
    }
    if (n.jobId) {
      router.push(`/jobs/${n.jobId}`);
      return;
    }
    if (n.type === 'announcement') {
      router.push('/announcements');
      return;
    }
    if (n.type === 'warehouse_alert') {
      router.push('/warehouse');
      return;
    }
    if (n.type === 'integration') {
      router.push('/settings/integrations');
      return;
    }
    if (n.type === 'automation') {
      router.push('/settings/automations');
      return;
    }
  }, [markOneRead, router]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const term = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (statusFilter === 'unread' && item.readAt) return false;
        if (statusFilter === 'read' && !item.readAt) return false;
        if (typeFilter !== 'all' && item.type !== typeFilter) return false;
        if (term && !item.message.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, search, statusFilter, typeFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  if (items === null) return <NotificationsSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</span>
          <span className="text-text-tertiary">/</span>
          <span>{items.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchItems}>
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={markAllRead} disabled={markingRead || unreadCount === 0}>
            Mark all read
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notifications"
          className="w-full rounded-md border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-gold"
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Chip
              key={filter.id}
              active={statusFilter === filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className="text-xs"
            >
              {filter.label}
            </Chip>
          ))}
          {TYPE_FILTERS.map((filter) => (
            <Chip
              key={filter.id}
              active={typeFilter === filter.id}
              onClick={() => setTypeFilter(filter.id)}
              className="text-xs"
            >
              {filter.label}
            </Chip>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">No notifications match the current filters.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((n) => {
            const meta = TYPE_META[n.type];
            return (
              <div
                key={n.id}
                className={cn(
                  'rounded-md border border-border-subtle bg-bg-section/30 p-4 transition-colors',
                  !n.readAt && 'ring-1 ring-accent-gold/25'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase', meta.className)}>
                        {meta.label}
                      </span>
                      {!n.readAt && (
                        <span className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-semibold text-accent-gold">
                          Unread
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void openNotification(n)}
                      className="text-left text-sm font-medium text-text-primary"
                    >
                      {n.message}
                    </button>
                    <p className="text-xs text-text-tertiary">{formatTime(n.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void openNotification(n)}
                    >
                      Open
                    </Button>
                    {!n.readAt && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void markOneRead(n.id)}
                        disabled={markingId === n.id}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
