'use client';

import { useCallback, useEffect, useState } from 'react';
import { CollapsibleSection, Button, Textarea } from '@/components/ui';
import type { JobReport } from '@/db/schema/job_reports';

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobReportsCard(props: { orgId: string; jobId: string }) {
  const [rows, setRows] = useState<JobReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-reports?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to load reports');
      setRows(json.data as JobReport[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: props.orgId, jobId: props.jobId, note: note.trim() }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to add report');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add report');
    } finally {
      setSaving(false);
    }
  };

  const latestReport = rows.reduce<JobReport | null>((latest, row) => {
    if (!latest) return row;
    return new Date(row.createdAt).getTime() > new Date(latest.createdAt).getTime() ? row : latest;
  }, null);
  const summary = loading
    ? 'Loading reports...'
    : rows.length === 0
      ? 'No reports yet'
      : `Last report ${new Date(latestReport?.createdAt ?? '').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`;

  return (
    <CollapsibleSection
      title="Reports"
      description="Job update notes and internal reporting."
      summary={summary}
      defaultOpen={false}
      storageKey={`job-detail-${props.jobId}-reports`}
      actions={
        <Button variant="secondary" size="sm" disabled>
          Generate summary (coming soon)
        </Button>
      }
    >

      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <Textarea
            placeholder="Add a report note (visible to the team)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            rows={3}
          />
        </div>
        <Button variant="primary" disabled={saving || !note.trim()} onClick={add}>
          {saving ? 'Adding...' : 'Add note'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading reports...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No reports yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">Report note</p>
                <p className="text-[11px] text-text-tertiary">{formatTs(String(r.createdAt))}</p>
              </div>
              <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{r.note}</p>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
