'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import NotificationsCenter, { type NotificationRow } from '@/components/notifications/NotificationsCenter';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';
import useIsMobile from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { NOTIFICATION_TYPE_LABELS } from '@/lib/notifications/constants';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsBell() {
  const { config } = useOrgConfig();
  const { session } = useSession();
  const router = useRouter();
  const isMobile = useIsMobile();
  const orgId = config?.orgId ?? '';
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<NotificationRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [loadingCount, setLoadingCount] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      if (!orgId) return;
      setLoadingCount(true);
      const res = await fetch(`/api/notifications?orgId=${orgId}&unreadCountOnly=true`);
      const json = (await res.json()) as ApiResponse<{ unreadCount: number }>;
      setUnreadCount(res.ok && json.ok ? Number(json.data?.unreadCount ?? 0) : 0);
    } catch {
      setUnreadCount(0);
    } finally {
      setLoadingCount(false);
    }
  }, [orgId]);

  const loadRecent = useCallback(async () => {
    try {
      if (!orgId) return;
      setLoadingRecent(true);
      const res = await fetch(`/api/notifications?orgId=${orgId}&limit=6`);
      const json = (await res.json()) as ApiResponse<{ notifications?: NotificationRow[] }>;
      if (!res.ok || !json.ok) {
        setRecent([]);
        return;
      }
      setRecent(json.data.notifications ?? []);
    } finally {
      setLoadingRecent(false);
    }
  }, [orgId]);

  const markOneRead = useCallback(
    async (id: string) => {
      if (!orgId) return;
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, ids: [id] }),
      });
      await loadUnreadCount();
    },
    [loadUnreadCount, orgId]
  );

  const openNotification = useCallback(
    async (n: NotificationRow) => {
      if (!n.readAt) {
        await markOneRead(n.id);
      }
      setOpen(false);
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
      }
    },
    [markOneRead, router]
  );

  useEffect(() => {
    if (!orgId || !session?.actor?.userId) return;
    const canSweep =
      session.actor.capabilities?.includes('admin') ||
      session.actor.capabilities?.includes('manage_org');
    if (!canSweep) return;

    const storageKey = `notification_sweep:${orgId}:${session.actor.userId}`;
    const now = Date.now();
    const lastRaw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    const last = lastRaw ? Number(lastRaw) : 0;
    if (last && now - last < 6 * 60 * 60 * 1000) return;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, String(now));
    }

    void fetch('/api/notifications/sweep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
  }, [orgId, session?.actor?.capabilities, session?.actor?.userId]);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) return;
    const load = async () => {
      if (cancelled) return;
      await loadUnreadCount();
    };
    void load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loadUnreadCount, orgId]);

  useEffect(() => {
    if (!open) return;
    void loadRecent();
  }, [loadRecent, open]);

  useEffect(() => {
    if (!modalOpen) {
      void loadUnreadCount();
    }
  }, [loadUnreadCount, modalOpen]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!open) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const dropdownContent = useMemo(() => {
    if (loadingRecent) {
      return <p className="text-xs text-text-tertiary">Loading notifications...</p>;
    }
    if (recent.length === 0) {
      return <p className="text-xs text-text-tertiary">No recent notifications.</p>;
    }
    return (
      <div className="space-y-2">
        {recent.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void openNotification(item)}
            className={cn(
              'w-full rounded-md border border-border-subtle bg-bg-section/30 px-3 py-2 text-left transition-colors',
              'hover:bg-bg-section/50',
              !item.readAt && 'ring-1 ring-accent-gold/25'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase text-text-tertiary">{NOTIFICATION_TYPE_LABELS[item.type]}</span>
              <span className="text-[11px] text-text-tertiary">{formatTime(item.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm text-text-primary line-clamp-2">{item.title ?? item.message}</p>
            {item.body && <p className="mt-1 text-xs text-text-secondary line-clamp-2">{item.body}</p>}
          </button>
        ))}
      </div>
    );
  }, [loadingRecent, openNotification, recent]);

  if (!orgId) return null;

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-card/40 text-text-secondary transition-all',
            'hover:text-text-primary hover:border-accent-gold/40 hover:bg-bg-card/70'
          )}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount !== null && unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent-gold px-1 text-[10px] font-semibold text-bg-base">
              {unreadCount}
            </span>
          )}
        </button>

        {open && (
          <Card
            padding="sm"
            className="absolute right-0 mt-2 w-[min(90vw,320px)] border border-border-subtle bg-bg-base shadow-lift z-50"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
              <p className="text-sm font-semibold text-text-primary">Notifications</p>
              <div className="text-xs text-text-tertiary">
                {loadingCount ? '...' : unreadCount ?? 0} unread
              </div>
            </div>
            <div className="mt-3 space-y-3">{dropdownContent}</div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
              >
                View all
              </Button>
              <Button variant="ghost" size="sm" onClick={loadRecent}>
                Refresh
              </Button>
            </div>
          </Card>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalOpen(false)} />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-4">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile
                  ? 'rounded-t-2xl mt-auto h-[94vh] overflow-hidden'
                  : 'rounded-lg w-[min(98vw,1400px)] h-[96vh] overflow-hidden'
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <p className="text-lg font-semibold text-text-primary">Notifications</p>
                  <p className="text-xs text-text-tertiary mt-1">Search, filter, and review activity.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="h-full overflow-hidden px-6 py-5">
                <div className="h-full overflow-y-auto pr-2 scrollbar-hidden">
                  <NotificationsCenter orgId={orgId} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
