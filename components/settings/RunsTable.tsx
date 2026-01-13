'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import type { CustomAutomationRule, CustomAutomationRun } from '@/components/settings/automation-builder/types';
import RunDetailsModal from '@/components/settings/RunDetailsModal';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  running: { label: 'Running', className: 'bg-amber-500/10 text-amber-300' },
  succeeded: { label: 'Succeeded', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  skipped: { label: 'Skipped', className: 'bg-bg-section/80 text-text-tertiary' },
  rate_limited: { label: 'Rate limited', className: 'bg-amber-500/10 text-amber-300' },
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

export default function RunsTable(props: { orgId: string; rules: CustomAutomationRule[] }) {
  const { orgId, rules } = props;
  const [runs, setRuns] = useState<CustomAutomationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ ruleId: '', status: '', eventId: '', start: '', end: '' });

  const rulesById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ orgId, mode: 'custom', limit: '50' });
      if (filters.ruleId) params.set('ruleId', filters.ruleId);
      if (filters.status) params.set('status', filters.status);
      if (filters.eventId) params.set('eventId', filters.eventId);
      if (filters.start) params.set('start', filters.start);
      if (filters.end) params.set('end', filters.end);

      const res = await fetch(`/api/automations/runs?${params.toString()}`);
      const json = (await res.json()) as ApiResponse<CustomAutomationRun[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load runs');
      setRuns(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [filters.end, filters.eventId, filters.ruleId, filters.start, filters.status, orgId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Run history (custom)</h2>
          <p className="text-xs text-text-tertiary mt-1">Track every custom automation run.</p>
        </div>
        <Button variant="secondary" onClick={() => void loadRuns()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <Select
          label="Rule"
          value={filters.ruleId}
          onChange={(e) => setFilters((prev) => ({ ...prev, ruleId: e.target.value }))}
        >
          <option value="">All rules</option>
          {rules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.name}
            </option>
          ))}
        </Select>
        <Select label="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABELS).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status].label}
            </option>
          ))}
        </Select>
        <Input
          label="Event ID"
          value={filters.eventId}
          onChange={(e) => setFilters((prev) => ({ ...prev, eventId: e.target.value }))}
          placeholder="Search event id"
        />
        <Input label="Start" type="date" value={filters.start} onChange={(e) => setFilters((prev) => ({ ...prev, start: e.target.value }))} />
        <Input label="End" type="date" value={filters.end} onChange={(e) => setFilters((prev) => ({ ...prev, end: e.target.value }))} />
      </div>

      {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading runs...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-text-tertiary">No runs yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const meta = STATUS_LABELS[run.status] ?? STATUS_LABELS.queued;
            const rule = rulesById.get(run.ruleId);
            return (
              <button
                key={run.id}
                className="w-full text-left rounded-md border border-border-subtle bg-bg-section/20 px-3 py-2 transition"
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">{rule?.name ?? 'Automation rule'}</span>
                  <Badge className={meta.className}>{meta.label}</Badge>
                </div>
                <div className="text-xs text-text-tertiary mt-1">{formatDate(run.createdAt)} - {run.eventKey}</div>
                {run.error && <div className="text-xs text-red-400 mt-1">{run.error}</div>}
              </button>
            );
          })}
        </div>
      )}

      {selectedRunId && (
        <RunDetailsModal
          orgId={orgId}
          runId={selectedRunId}
          ruleName={selectedRun ? rulesById.get(selectedRun.ruleId)?.name ?? null : null}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </Card>
  );
}
