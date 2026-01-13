'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import type { CustomAutomationRun, CustomAutomationRunStep } from '@/components/settings/automation-builder/types';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-bg-section/80 text-text-tertiary' },
  running: { label: 'Running', className: 'bg-amber-500/10 text-amber-300' },
  succeeded: { label: 'Succeeded', className: 'bg-emerald-500/10 text-emerald-300' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-300' },
  skipped: { label: 'Skipped', className: 'bg-bg-section/80 text-text-tertiary' },
  rate_limited: { label: 'Rate limited', className: 'bg-amber-500/10 text-amber-300' },
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type RunDetail = { run: CustomAutomationRun; steps: CustomAutomationRunStep[] };

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function RunDetailsModal(props: { orgId: string; runId: string; ruleName: string | null; onClose: () => void }) {
  const { orgId, runId, ruleName, onClose } = props;
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/automations/runs/${runId}?orgId=${orgId}&mode=custom`);
        const json = (await res.json()) as ApiResponse<RunDetail>;
        if (!res.ok || !json.ok) throw new Error('Failed to load run details');
        if (active) setDetail(json.data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load run details');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [orgId, runId]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
        <Card
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-3xl'
          )}
          {...swipe}
        >
          <div className="p-4 md:p-6 space-y-4">
            {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Run details</h3>
                <p className="text-xs text-text-tertiary mt-1">{ruleName ?? 'Automation rule'}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                Close
              </Button>
            </div>

            {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

            {loading || !detail ? (
              <p className="text-sm text-text-tertiary">Loading run details...</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-text-tertiary">Status</p>
                    <Badge className={(STATUS_LABELS[detail.run.status] ?? STATUS_LABELS.queued).className}>
                      {(STATUS_LABELS[detail.run.status] ?? STATUS_LABELS.queued).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">Event</p>
                    <p className="text-text-primary">{detail.run.eventKey}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">Event ID</p>
                    <p className="text-text-primary break-all">{detail.run.eventId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">Started</p>
                    <p className="text-text-primary">{formatDate(detail.run.startedAt ?? detail.run.createdAt)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-text-primary mb-2">Steps</p>
                  <div className="space-y-2">
                    {detail.steps.length === 0 ? (
                      <p className="text-xs text-text-tertiary">No steps recorded.</p>
                    ) : (
                      detail.steps.map((step) => {
                        const meta = STATUS_LABELS[step.status] ?? STATUS_LABELS.queued;
                        return (
                          <div key={step.id} className="rounded-md border border-border-subtle bg-bg-section/20 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-text-primary">{step.actionType}</p>
                                <p className="text-xs text-text-tertiary mt-1">Step {step.stepIndex + 1}</p>
                              </div>
                              <Badge className={meta.className}>{meta.label}</Badge>
                            </div>
                            {step.commPreview && (
                              <div className="mt-2 text-xs text-text-tertiary">
                                <div>{step.commPreview.subject ?? step.commPreview.templateKey}</div>
                                <div className="mt-1">{step.commPreview.previewText ?? '-'}</div>
                              </div>
                            )}
                            {step.result && (
                              <div className="text-xs text-text-tertiary mt-2">Outbox IDs: {(step.result.outboxIds || []).join(', ')}</div>
                            )}
                            {step.error && <div className="text-xs text-red-400 mt-2">{step.error}</div>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Textarea label="Event payload" rows={8} value={JSON.stringify(detail.run.eventPayload ?? {}, null, 2)} readOnly />
                  <Textarea label="Match details" rows={8} value={JSON.stringify(detail.run.matchDetails ?? {}, null, 2)} readOnly />
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
