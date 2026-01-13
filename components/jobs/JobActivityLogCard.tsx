'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleSection, Button, Input } from '@/components/ui';
import type { JobActivityEventWithActor } from '@/lib/queries/job_activity';

function formatTs(ts: Date | string) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function describe(event: JobActivityEventWithActor): { title: string; detail?: string } {
  const p = event.payload || {};
  switch (event.type) {
    case 'note_added':
      return { title: 'Note added', detail: String(p.message || '') };
    case 'photo_uploaded':
      return { title: 'Photo uploaded' };
    case 'photo_deleted':
      return { title: 'Photo deleted' };
    case 'contact_created':
      return { title: 'Contact added', detail: p?.name ? String(p.name) : undefined };
    case 'contact_updated':
      return { title: 'Contact updated' };
    case 'contact_deleted':
      return { title: 'Contact deleted' };
    case 'task_completed':
      return { title: 'Work step completed', detail: p?.title ? String(p.title) : undefined };
    case 'task_reopened':
      return { title: 'Work step reopened', detail: p?.title ? String(p.title) : undefined };
    case 'schedule_assignment_created':
      return { title: 'Scheduled', detail: p?.crewId ? `Crew ${String(p.crewId).slice(0, 8)}...` : undefined };
    case 'schedule_assignment_updated':
      return { title: 'Schedule updated', detail: p?.crewId ? `Crew ${String(p.crewId).slice(0, 8)}...` : undefined };
    case 'schedule_assignment_deleted':
      return { title: 'Unscheduled', detail: p?.crewId ? `Crew ${String(p.crewId).slice(0, 8)}...` : undefined };
    case 'document_uploaded':
      return { title: 'Document uploaded', detail: p?.title ? String(p.title) : undefined };
    case 'document_linked':
      return { title: 'Document linked', detail: p?.title ? String(p.title) : undefined };
    case 'document_deleted':
      return { title: 'Document removed', detail: p?.title ? String(p.title) : undefined };
    case 'order_created':
      return { title: 'Order added', detail: p?.item ? String(p.item) : undefined };
    case 'order_updated':
      return { title: 'Order updated', detail: p?.item ? String(p.item) : undefined };
    case 'order_deleted':
      return { title: 'Order removed', detail: p?.item ? String(p.item) : undefined };
    case 'hours_logged':
      return { title: 'Hours logged', detail: p?.minutes ? `${String(p.minutes)} min` : undefined };
    case 'report_added':
      return { title: 'Report note added' };
    case 'margin_warning':
      return {
        title: 'Margin warning',
        detail: p?.marginPercent != null ? `Margin ${Number(p.marginPercent).toFixed(1)}%` : undefined,
      };
    case 'margin_critical':
      return {
        title: 'Margin critical',
        detail: p?.marginPercent != null ? `Margin ${Number(p.marginPercent).toFixed(1)}%` : undefined,
      };
    case 'cost_variance_exceeded':
      return {
        title: 'Cost variance exceeded',
        detail: p?.costVariancePercent != null ? `Variance ${Number(p.costVariancePercent).toFixed(1)}%` : undefined,
      };
    default:
      return { title: event.type };
  }
}

export default function JobActivityLogCard(props: { orgId: string; jobId: string }) {
  const [events, setEvents] = useState<JobActivityEventWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-activity?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load activity log');
      setEvents(json.data as JobActivityEventWithActor[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!message.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/job-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: props.orgId, jobId: props.jobId, message: message.trim() }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to add note');
      setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add note');
    } finally {
      setPosting(false);
    }
  };

  const rendered = useMemo(() => events.map((e) => ({ e, d: describe(e) })), [events]);

  return (
    <CollapsibleSection
      title="Activity"
      description="Append-only log of changes and updates."
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-activity`}
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Add a note (visible to the team)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={posting}
          />
        </div>
        <Button variant="primary" disabled={posting || !message.trim()} onClick={submit}>
          {posting ? 'Posting...' : 'Add note'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading activity...</p>
      ) : rendered.length === 0 ? (
        <p className="text-sm text-text-secondary">No activity yet.</p>
      ) : (
        <div className="space-y-2">
          {rendered.map(({ e, d }) => (
            <div key={e.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">{d.title}</p>
                <p className="text-[11px] text-text-tertiary">{formatTs(e.createdAt)}</p>
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {[e.actorDisplayName, d.detail].filter(Boolean).join(' - ')}
              </p>
              {e.type === 'note_added' && d.detail && (
                <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{d.detail}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
