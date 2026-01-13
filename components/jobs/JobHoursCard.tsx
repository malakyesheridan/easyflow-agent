'use client';

import { useCallback, useEffect, useState } from 'react';
import { CollapsibleSection, Button, Input } from '@/components/ui';
import type { JobHoursLog } from '@/db/schema/job_hours_logs';

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobHoursCard(props: { orgId: string; jobId: string }) {
  const [rows, setRows] = useState<JobHoursLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [initialHasEntries, setInitialHasEntries] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-hours?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load hours');
      setRows(json.data as JobHoursLog[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hours');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (initialHasEntries !== null) return;
    setInitialHasEntries(rows.length > 0);
  }, [initialHasEntries, loading, rows.length]);

  const add = async () => {
    const m = Number(minutes.trim());
    if (!Number.isFinite(m) || m <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          minutes: m,
          note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to log hours');
      setMinutes('');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log hours');
    } finally {
      setSaving(false);
    }
  };

  const totalMinutes = rows.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
  const summary = loading
    ? 'Loading hours...'
    : rows.length === 0
      ? 'No hours logged yet'
      : `Total time logged: ${totalMinutes}m`;
  const defaultOpen = initialHasEntries === null ? false : !initialHasEntries;
  const sectionKey = initialHasEntries === null ? 'loading' : initialHasEntries ? 'has-entries' : 'empty';

  return (
    <CollapsibleSection
      key={sectionKey}
      title="Hours"
      description="Manual hour logs for this job."
      summary={summary}
      defaultOpen={defaultOpen}
      storageKey={`job-detail-${props.jobId}-hours`}
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Input
          placeholder="Minutes (e.g. 90)"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))}
          disabled={saving}
        />
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
        <Button onClick={add} disabled={saving || !minutes.trim()}>
          {saving ? 'Logging...' : 'Log time'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading hours...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No hours logged yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{r.minutes} min</p>
                {r.note && <p className="text-xs text-text-secondary mt-0.5">{r.note}</p>}
              </div>
              <p className="text-[11px] text-text-tertiary">{formatTs(String(r.createdAt))}</p>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
