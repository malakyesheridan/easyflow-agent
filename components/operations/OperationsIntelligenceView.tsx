'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ZERO_UUID } from '@/lib/org/orgId';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';
import type { OperationsIntelligencePayload, OperationsSignal } from '@/lib/types/operations_intelligence';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { message?: string } | string };

const SEVERITY_LABELS: Record<string, { label: string; badge: 'gold' | 'default' | 'muted' }> = {
  critical: { label: 'Critical', badge: 'gold' },
  warning: { label: 'Warning', badge: 'default' },
  info: { label: 'Info', badge: 'muted' },
};

const STATUS_LABELS: Record<string, { label: string; badge: 'default' | 'muted' }> = {
  open: { label: 'Open', badge: 'default' },
  acknowledged: { label: 'Acknowledged', badge: 'muted' },
  resolved: { label: 'Resolved', badge: 'muted' },
};

function formatTimestamp(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMinutes(value: number | null): string {
  if (value === null) return '-';
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function OperationsIntelligenceView({ orgId }: { orgId?: string }) {
  const { config } = useOrgConfig();
  const { session } = useSession();
  const resolvedOrgId = orgId && orgId !== ZERO_UUID ? orgId : config?.orgId ?? '';

  const [payload, setPayload] = useState<OperationsIntelligencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [resolveSignal, setResolveSignal] = useState<OperationsSignal | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!resolvedOrgId) return;
      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/operations/intelligence?orgId=${resolvedOrgId}`, { cache: 'no-store' });
        const json = (await res.json()) as ApiResponse<OperationsIntelligencePayload>;
        if (!res.ok || !json.ok) {
          const message = !json.ok ? (typeof json.error === 'string' ? json.error : json.error?.message) : null;
          throw new Error(message || `Failed to load intelligence feed (HTTP ${res.status})`);
        }
        setPayload(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load intelligence feed');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [resolvedOrgId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  useEffect(() => {
    if (!payload) return;
    if (!selectedSignalId && payload.signals.length > 0) {
      setSelectedSignalId(payload.signals[0].id);
      return;
    }
    if (selectedSignalId && !payload.signals.some((signal) => signal.id === selectedSignalId)) {
      setSelectedSignalId(payload.signals[0]?.id ?? null);
    }
  }, [payload, selectedSignalId]);

  useEffect(() => {
    setActionError(null);
  }, [selectedSignalId]);

  const jobsById = useMemo(() => new Map(payload?.entities.jobs.map((job) => [job.id, job]) ?? []), [payload]);
  const crewsById = useMemo(() => new Map(payload?.entities.crews.map((crew) => [crew.id, crew]) ?? []), [payload]);

  const selectedSignal = payload?.signals.find((signal) => signal.id === selectedSignalId) ?? null;

  const performAction = useCallback(
    async (signal: OperationsSignal, action: 'acknowledge' | 'assign' | 'resolve', body?: Record<string, unknown>) => {
      if (!resolvedOrgId || !signal.signalEventId) return;
      setActionBusy(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/operations/intelligence/${signal.signalEventId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: resolvedOrgId, ...(body ?? {}) }),
        });
        const json = (await res.json()) as ApiResponse<unknown>;
        if (!res.ok || !json.ok) {
          const message = !json.ok ? (typeof json.error === 'string' ? json.error : json.error?.message) : null;
          throw new Error(message || 'Action failed');
        }
        await load({ silent: true });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setActionBusy(false);
      }
    },
    [load, resolvedOrgId]
  );

  const scoreboard = payload?.scoreboard ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-text-tertiary">
          {payload ? `Updated ${formatTimestamp(payload.generatedAt)}` : 'Loading intelligence feed...'}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent-gold"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto refresh (30s)
          </label>
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading || refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading && !payload && (
        <Card>
          <p className="text-sm text-text-secondary">Loading intelligence feed...</p>
        </Card>
      )}

      {error && (
        <Card>
          <p className="text-sm font-semibold text-destructive">Error loading intelligence feed</p>
          <p className="text-xs text-text-tertiary mt-1">{error}</p>
        </Card>
      )}

      {payload && scoreboard && (
        <Card padding="sm">
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">At risk jobs</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{scoreboard.atRiskJobs}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Idle crews</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{scoreboard.idleCrews}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Open critical</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{scoreboard.openCriticalSignals}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Avg time to ack</p>
              <p className="text-lg font-semibold text-text-primary mt-1">
                {scoreboard.avgTimeToAckMinutes !== null ? formatMinutes(Math.round(scoreboard.avgTimeToAckMinutes)) : '-'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {payload && (
        <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
          <Card padding="none">
            <div className="border-b border-border-subtle px-4 py-3">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">Intelligence feed</p>
              <p className="text-sm text-text-secondary mt-1">{payload.signals.length} open signals</p>
            </div>
            {payload.signals.length === 0 ? (
              <div className="px-4 py-6 text-sm text-text-tertiary">No active signals right now.</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {payload.signals.map((signal) => {
                  const severityMeta = SEVERITY_LABELS[signal.severity] ?? SEVERITY_LABELS.info;
                  const statusMeta = STATUS_LABELS[signal.status] ?? STATUS_LABELS.open;
                  const entityLabel =
                    signal.entityType === 'job'
                      ? jobsById.get(signal.entityId)?.title ?? `Job ${signal.entityId.slice(0, 8)}`
                      : crewsById.get(signal.entityId)?.name ?? `Crew ${signal.entityId.slice(0, 8)}`;
                  const isActive = signal.id === selectedSignalId;

                  return (
                    <button
                      key={signal.id}
                      type="button"
                      onClick={() => setSelectedSignalId(signal.id)}
                      className={cn(
                        'w-full text-left px-4 py-4 transition',
                        isActive ? 'bg-bg-card/70' : 'hover:bg-bg-card/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{signal.headline}</p>
                          <p className="text-xs text-text-tertiary mt-1 truncate">{entityLabel}</p>
                        </div>
                        <Badge variant={severityMeta.badge}>{severityMeta.label}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                        <Badge variant={statusMeta.badge}>{statusMeta.label}</Badge>
                        <span>{formatTimestamp(signal.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            {!selectedSignal && (
              <p className="text-sm text-text-tertiary">Select a signal to review details.</p>
            )}

            {selectedSignal && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-tertiary">Signal</p>
                    <h2 className="text-xl font-semibold text-text-primary mt-2">{selectedSignal.headline}</h2>
                  </div>
                  <Badge variant={(SEVERITY_LABELS[selectedSignal.severity] ?? SEVERITY_LABELS.info).badge}>
                    {(SEVERITY_LABELS[selectedSignal.severity] ?? SEVERITY_LABELS.info).label}
                  </Badge>
                </div>

                <p className="text-sm text-text-secondary">{selectedSignal.reason}</p>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant={(STATUS_LABELS[selectedSignal.status] ?? STATUS_LABELS.open).badge}>
                    {(STATUS_LABELS[selectedSignal.status] ?? STATUS_LABELS.open).label}
                  </Badge>
                  <Badge variant="muted">{selectedSignal.entityType === 'job' ? 'Job' : 'Crew'}</Badge>
                </div>

                <Card className="p-4">
                  <p className="text-sm font-semibold text-text-primary">Accountability</p>
                  <div className="mt-3 grid gap-2 text-xs text-text-secondary md:grid-cols-2">
                    <div>
                      <p className="text-text-tertiary">Owner</p>
                      <p className="text-text-primary">{selectedSignal.assignedToName ?? 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">Created</p>
                      <p className="text-text-primary">{formatTimestamp(selectedSignal.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">Acknowledged</p>
                      <p className="text-text-primary">
                        {selectedSignal.acknowledgedAt ? formatTimestamp(selectedSignal.acknowledgedAt) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">Resolved</p>
                      <p className="text-text-primary">
                        {selectedSignal.resolvedAt ? formatTimestamp(selectedSignal.resolvedAt) : '-'}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <p className="text-sm font-semibold text-text-primary">Evidence</p>
                  <div className="mt-3 space-y-2 text-xs text-text-secondary">
                    {Object.entries(selectedSignal.evidence ?? {}).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-3">
                        <span className="text-text-tertiary">{key}</span>
                        <span className="text-text-primary text-right">{formatEvidenceValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4">
                  <p className="text-sm font-semibold text-text-primary">Recommended actions</p>
                  {selectedSignal.recommendedActions.length === 0 ? (
                    <p className="text-xs text-text-tertiary mt-2">No recommended actions provided.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                      {selectedSignal.recommendedActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  )}
                </Card>

                {actionError && <p className="text-xs text-destructive">{actionError}</p>}

                <div className="grid gap-2 md:grid-cols-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => selectedSignal && void performAction(selectedSignal, 'acknowledge')}
                    disabled={actionBusy || selectedSignal.status !== 'open'}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => selectedSignal && void performAction(selectedSignal, 'assign')}
                    disabled={actionBusy}
                  >
                    {selectedSignal.assignedToUserId === session?.user?.id ? 'Assigned to you' : 'Assign owner'}
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => setResolveSignal(selectedSignal)}
                    disabled={actionBusy}
                  >
                    Resolve
                  </Button>
                  {selectedSignal.deepLinks.map((link) =>
                    link.external ? (
                      <Button
                        key={link.href}
                        variant="ghost"
                        className="w-full"
                        onClick={() => window.open(link.href, '_blank')}
                      >
                        {link.label}
                      </Button>
                    ) : (
                      <Link key={link.href} href={link.href}>
                        <Button variant="ghost" className="w-full">
                          {link.label}
                        </Button>
                      </Link>
                    )
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {resolveSignal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => {
              setResolveSignal(null);
              setResolutionReason('');
              setResolutionNotes('');
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Resolve signal</p>
                <h3 className="text-lg font-semibold text-text-primary mt-2">{resolveSignal.headline}</h3>
              </div>
              <Textarea
                label="Resolution reason"
                rows={3}
                value={resolutionReason}
                onChange={(event) => setResolutionReason(event.target.value)}
                placeholder="Summarize the resolution."
              />
              <Textarea
                label="Notes"
                rows={3}
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
                placeholder="Optional notes for the record."
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setResolveSignal(null);
                    setResolutionReason('');
                    setResolutionNotes('');
                  }}
                  disabled={actionBusy}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!resolveSignal) return;
                    if (!resolutionReason.trim()) {
                      setActionError('Resolution reason is required.');
                      return;
                    }
                    void performAction(resolveSignal, 'resolve', {
                      resolutionReason: resolutionReason.trim(),
                      notes: resolutionNotes.trim() || null,
                    });
                    setResolveSignal(null);
                    setResolutionReason('');
                    setResolutionNotes('');
                  }}
                  disabled={actionBusy}
                >
                  Resolve
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
