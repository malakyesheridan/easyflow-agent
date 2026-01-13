'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, CollapsibleSection } from '@/components/ui';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type IntegrationEventRow = {
  id: string;
  provider: string;
  eventType: string;
  actionType: string;
  status: string;
  error: string | null;
  createdAt: string;
  latencyMs: number | null;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  success: { label: 'Success', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  processing: { label: 'Running', className: 'bg-amber-500/10 text-amber-300' },
};

export default function JobIntegrationActivityCard(props: { orgId: string; jobId: string }) {
  const [events, setEvents] = useState<IntegrationEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-integration-events?orgId=${props.orgId}&jobId=${props.jobId}&limit=20`);
      const json = (await res.json()) as ApiResponse<IntegrationEventRow[]>;
      if (!res.ok || !json.ok) throw new Error(json.ok ? 'Failed to load activity.' : json.error?.message || 'Failed to load activity.');
      setEvents(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CollapsibleSection
      title="Automation activity"
      description="Recent integration actions for this job."
      defaultOpen
      storageKey={`job-detail-${props.jobId}-automation`}
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading activity...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-text-secondary">No integration activity yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map((row) => {
            const meta = statusMeta[row.status] ?? statusMeta.queued;
            return (
              <div key={row.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary">
                      {row.provider} · {row.eventType} → {row.actionType}
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-1">
                      {new Date(row.createdAt).toLocaleString()}
                      {row.latencyMs ? ` · ${row.latencyMs}ms` : ''}
                    </p>
                    {row.error ? <p className="text-[11px] text-red-400 mt-1">{row.error}</p> : null}
                  </div>
                  <Badge className={meta.className}>{meta.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
