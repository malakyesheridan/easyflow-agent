'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type AnnouncementItem = {
  id: string;
  title: string;
  message: string;
  priority: 'urgent' | 'normal';
  acknowledgedAt: string | null;
};

export default function AnnouncementsGate() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? null;
  const [announcement, setAnnouncement] = useState<AnnouncementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [ackLoading, setAckLoading] = useState(false);
  const isMobile = useIsMobile();

  const behavior = useMemo(
    () => (config?.urgentAnnouncementBehavior === 'banner' ? 'banner' : 'modal'),
    [config]
  );

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      if (!config?.announcementsEnabled) {
        setAnnouncement(null);
        return;
      }

      const annRes = await fetch(`/api/announcements?orgId=${orgId}&priority=urgent&unacknowledgedOnly=true&limit=1`);
      const annJson = (await annRes.json()) as ApiResponse<AnnouncementItem[]>;
      if (!annRes.ok || !annJson.ok) {
        setAnnouncement(null);
        return;
      }
      setAnnouncement(annJson.data?.[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, [config?.announcementsEnabled, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = useCallback(async () => {
    if (!announcement) return;
    if (!orgId) return;
    setAckLoading(true);
    try {
      await fetch('/api/announcements/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, announcementId: announcement.id }),
      });
      setAnnouncement(null);
    } finally {
      setAckLoading(false);
      void load();
    }
  }, [announcement, load, orgId]);

  const swipe = useSwipeToClose(() => {
    if (!ackLoading) void acknowledge();
  }, isMobile);

  if (loading) return null;
  if (!config?.announcementsEnabled) return null;
  if (!announcement) return null;

  if (behavior === 'banner') {
    return (
      <div className="fixed top-0 left-0 md:left-64 right-0 z-50 border-b border-red-500/20 bg-red-500/10 px-6 py-3">
        <div className="mx-auto max-w-7xl flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-200 truncate">Urgent: {announcement.title}</p>
            <p className="text-xs text-red-100/80 mt-0.5 line-clamp-2 whitespace-pre-wrap">{announcement.message}</p>
          </div>
          <Button variant="secondary" onClick={acknowledge} disabled={ackLoading}>
            {ackLoading ? 'Acknowledging...' : 'Acknowledge'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-4">
        <Card
          padding="none"
          className={cn(
            'w-full ring-1 ring-red-500/25',
            isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-xl'
          )}
          {...swipe}
        >
          <div className="p-4 md:p-6">
            {isMobile && <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border-subtle" />}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Urgent {config?.vocabulary?.announcementSingular ?? 'Announcement'}</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">{announcement.title}</h2>
              </div>
            </div>

            <p className="mt-3 text-sm text-text-secondary whitespace-pre-wrap">{announcement.message}</p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button onClick={acknowledge} disabled={ackLoading}>
                {ackLoading ? 'Acknowledging...' : 'Acknowledge'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
