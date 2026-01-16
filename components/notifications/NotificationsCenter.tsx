'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_SEVERITY_BADGES,
  NOTIFICATION_TYPE_BADGES,
  NOTIFICATION_TYPE_LABELS,
  type NotificationSeverity,
  type NotificationType,
} from '@/lib/notifications/constants';

export type NotificationRow = {
  id: string;
  orgId: string;
  type: NotificationType;
  title: string | null;
  body: string | null;
  severity: NotificationSeverity | null;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  jobId: string | null;
  eventKey: string | null;
  message: string;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type StatusFilter = 'all' | 'unread' | 'read';
type TypeFilter = 'all' | NotificationType;

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'contact_followup_overdue', label: 'Contact follow-ups' },
  { id: 'new_hot_prospect', label: 'Hot prospects' },
  { id: 'appraisal_upcoming', label: 'Appraisals upcoming' },
  { id: 'appraisal_followup_due', label: 'Appraisal follow-ups' },
  { id: 'appraisal_stage_changed', label: 'Appraisal stages' },
  { id: 'listing_milestone_overdue', label: 'Listing milestones' },
  { id: 'vendor_report_due', label: 'Vendor reports due' },
  { id: 'vendor_update_overdue', label: 'Vendor updates overdue' },
  { id: 'inspection_scheduled', label: 'Inspections' },
  { id: 'report_generated', label: 'Reports generated' },
  { id: 'listing_health_stalling', label: 'Listing health' },
  { id: 'new_buyer_match', label: 'Buyer matches' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'integration', label: 'Integrations' },
  { id: 'automation', label: 'Automations' },
  { id: 'job_progress', label: 'Jobs (legacy)' },
  { id: 'warehouse_alert', label: 'Warehouse (legacy)' },
];

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
    if (n.deepLink) {
      router.push(n.deepLink);
      return;
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
        if (
          term &&
          !(
            item.message.toLowerCase().includes(term) ||
            (item.title ?? '').toLowerCase().includes(term) ||
            (item.body ?? '').toLowerCase().includes(term)
          )
        ) return false;
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
            const meta = {
              label: NOTIFICATION_TYPE_LABELS[n.type],
              className: NOTIFICATION_TYPE_BADGES[n.type],
            };
            const severityBadge = n.severity ? NOTIFICATION_SEVERITY_BADGES[n.severity] : null;
            const title = n.title ?? n.message;
            const body = n.body ?? (n.title ? n.message : null);
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
                      {severityBadge && (
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase', severityBadge)}>
                          {n.severity}
                        </span>
                      )}
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
                      {title}
                    </button>
                    {body && (
                      <p className="text-xs text-text-secondary">{body}</p>
                    )}
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
