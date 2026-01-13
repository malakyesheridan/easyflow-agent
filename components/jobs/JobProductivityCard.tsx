'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Select, Chip } from '@/components/ui';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobProductivityPayload = {
  jobId: string;
  plannedM2: number | null;
  variationM2: number | null;
  claimedM2: number | null;
  acceptedM2: number | null;
  reworkM2: number | null;
  acceptedM2ApprovedBy: string | null;
  acceptedM2ApprovedAt: string | null;
  complexityAccessDifficulty: number | null;
  complexityHeightLiftRequirement: number | null;
  complexityPanelHandlingSize: number | null;
  complexitySiteConstraints: number | null;
  complexityDetailingComplexity: number | null;
  qualityDefectCount: number;
  qualityCallbackFlag: boolean;
  qualityMissingDocsFlag: boolean;
  qualitySafetyFlag: boolean;
};

type MetricsFlag = {
  code: string;
  severity: 'info' | 'warn';
  message: string;
  data?: Record<string, number | string>;
};

type JobMetrics = {
  acceptedM2: number;
  acceptedM2Net: number;
  plannedM2: number;
  variationM2: number;
  claimedM2: number;
  reworkM2: number;
  installPersonMinutes: number;
  onsitePersonMinutes: number;
  crewInstallWindowMinutes: number;
  nir: number;
  str: number;
  cir: number;
  complexityScore: number;
  complexityMultiplier: number;
  qualityScore: number;
  qualityMultiplier: number;
  caNir: number;
  qaNir: number;
  cqaNir: number;
  reworkMinutes: number;
  reworkMinutesPct: number;
  waitingMinutes: number;
  waitingMinutesPct: number;
  waitingMinutesByReason: Record<string, number>;
  bucketMinutes: Record<string, number>;
  unbucketedMinutes: number;
  installWindowStart: string | null;
  installWindowEnd: string | null;
  flags: MetricsFlag[];
};

type MetricsResponse = {
  jobId: string;
  metrics: JobMetrics;
  legacy: { m2PerMinute: number; totalM2: number; totalMinutes: number; source: string } | null;
};

type MetricKey =
  | 'nir'
  | 'str'
  | 'cir'
  | 'ca_nir'
  | 'qa_nir'
  | 'cqa_nir'
  | 'waiting_pct'
  | 'rework_pct';

type MetricCompareResponse = {
  metric: {
    key: MetricKey;
    label: string;
    abbreviation: string;
    unit: 'rate' | 'percent';
  };
  job: {
    id: string;
    title: string;
    value: number;
  };
  windows: {
    days7: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
    days30: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
    days90: { average: number; jobs: Array<{ id: string; name: string; value: number }>; employees?: Array<{ id: string; name: string; value: number }> };
  };
};

const complexityOptions = ['1', '2', '3', '4', '5'];
const delayReasonLabels: Record<string, string> = {
  ACCESS_KEYS_NOT_READY: 'Access / keys not ready',
  DELIVERY_LATE_OR_WRONG: 'Delivery late or wrong',
  WEATHER: 'Weather',
  EQUIPMENT_LIFT_CRANE_WAIT: 'Equipment lift/crane wait',
  SAFETY_PERMIT_INDUCTION: 'Safety / permit / induction',
  CLIENT_CHANGE_SCOPE: 'Client change scope',
  REWORK_DEFECT_FIX: 'Rework defect fix',
  OTHER_WITH_NOTE: 'Other (note)',
};

function parseNumber(value: string, allowNegative = false): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!allowNegative && parsed < 0) return null;
  return parsed;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '--';
  return rate.toFixed(3).replace(/\.?0+$/, '');
}

function formatRateValue(rate: number): string {
  if (!Number.isFinite(rate)) return '--';
  return rate.toFixed(3).replace(/\.?0+$/, '');
}

function formatM2(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return '--';
  return num.toFixed(1).replace(/\.0$/, '');
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatMetricValue(unit: 'rate' | 'percent', value: number): string {
  return unit === 'percent' ? formatPercentValue(value) : formatRate(value);
}

function formatMetricDelta(unit: 'rate' | 'percent', value: number): string {
  const abs = Math.abs(value);
  const formatted = unit === 'percent' ? formatPercentValue(abs) : formatRateValue(abs);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

const METRIC_CARDS: Array<{
  key: MetricKey;
  label: string;
  value: (metrics: JobMetrics) => number;
  subtitle: (metrics: JobMetrics) => string;
}> = [
  {
    key: 'nir',
    label: 'NIR',
    value: (metrics) => metrics.nir,
    subtitle: (metrics) => `${Math.round(metrics.installPersonMinutes)} install min`,
  },
  {
    key: 'str',
    label: 'STR',
    value: (metrics) => metrics.str,
    subtitle: (metrics) => `${Math.round(metrics.onsitePersonMinutes)} onsite min`,
  },
  {
    key: 'cir',
    label: 'CIR',
    value: (metrics) => metrics.cir,
    subtitle: (metrics) => `${Math.round(metrics.crewInstallWindowMinutes)} window min`,
  },
  {
    key: 'ca_nir',
    label: 'CA-NIR',
    value: (metrics) => metrics.caNir,
    subtitle: (metrics) => `Complexity ${metrics.complexityScore.toFixed(1)} (${metrics.complexityMultiplier.toFixed(2)}x)`,
  },
  {
    key: 'qa_nir',
    label: 'QA-NIR',
    value: (metrics) => metrics.qaNir,
    subtitle: (metrics) => `Quality ${metrics.qualityScore.toFixed(0)} (${metrics.qualityMultiplier.toFixed(2)}x)`,
  },
  {
    key: 'cqa_nir',
    label: 'CQA-NIR',
    value: (metrics) => metrics.cqaNir,
    subtitle: () => 'Combined adjustment',
  },
  {
    key: 'waiting_pct',
    label: 'Waiting minutes',
    value: (metrics) => metrics.waitingMinutes,
    subtitle: (metrics) => `Share of onsite: ${formatPercent(metrics.waitingMinutesPct)}`,
  },
  {
    key: 'rework_pct',
    label: 'Rework minutes',
    value: (metrics) => metrics.reworkMinutes,
    subtitle: (metrics) => `Share of onsite: ${formatPercent(metrics.reworkMinutesPct)}`,
  },
];

const METRIC_DESCRIPTIONS: Record<MetricKey, string> = {
  nir: 'Accepted m2 divided by install person-minutes.',
  str: 'Accepted m2 divided by onsite person-minutes.',
  cir: 'Accepted m2 divided by the crew install window.',
  ca_nir: 'NIR adjusted down by the complexity multiplier.',
  qa_nir: 'NIR adjusted by the quality multiplier.',
  cqa_nir: 'NIR adjusted for complexity and quality.',
  waiting_pct: 'Waiting minutes as a share of onsite time.',
  rework_pct: 'Rework minutes as a share of onsite time.',
};

function canManageProductivity(caps: string[]): boolean {
  return caps.includes('admin') || caps.includes('manage_jobs') || caps.includes('manage_org');
}

function getApiErrorMessage(payload: ApiResponse<any>): string | undefined {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
}

export default function JobProductivityCard(props: { orgId: string; jobId: string }) {
  const { session } = useSession();
  const { config } = useOrgConfig();
  const capabilities = session?.actor?.capabilities ?? [];
  const canManage = canManageProductivity(capabilities);
  const callbackDays = config?.qualityCallbackDays ?? 30;

  const [output, setOutput] = useState<JobProductivityPayload | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingOutput, setSavingOutput] = useState(false);
  const [savingQuality, setSavingQuality] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricModalKey, setMetricModalKey] = useState<MetricKey | null>(null);
  const [metricModalData, setMetricModalData] = useState<MetricCompareResponse | null>(null);
  const [metricModalLoading, setMetricModalLoading] = useState(false);
  const [metricModalError, setMetricModalError] = useState<string | null>(null);
  const [metricWindow, setMetricWindow] = useState<'days7' | 'days30' | 'days90'>('days30');

  const [plannedM2, setPlannedM2] = useState('');
  const [variationM2, setVariationM2] = useState('');
  const [claimedM2, setClaimedM2] = useState('');
  const [acceptedM2, setAcceptedM2] = useState('');
  const [reworkM2, setReworkM2] = useState('');

  const [accessDifficulty, setAccessDifficulty] = useState('');
  const [heightLift, setHeightLift] = useState('');
  const [panelHandling, setPanelHandling] = useState('');
  const [siteConstraints, setSiteConstraints] = useState('');
  const [detailingComplexity, setDetailingComplexity] = useState('');

  const [defectCount, setDefectCount] = useState('');
  const [callbackFlag, setCallbackFlag] = useState(false);
  const [missingDocsFlag, setMissingDocsFlag] = useState(false);
  const [safetyFlag, setSafetyFlag] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [outputRes, metricsRes] = await Promise.all([
        fetch(`/api/job-productivity?orgId=${props.orgId}&jobId=${props.jobId}`),
        fetch(`/api/install-productivity?orgId=${props.orgId}&jobId=${props.jobId}`),
      ]);
      const outputJson = (await outputRes.json()) as ApiResponse<JobProductivityPayload>;
      const metricsJson = (await metricsRes.json()) as ApiResponse<MetricsResponse>;

      if (!outputRes.ok || !outputJson.ok) {
        throw new Error(getApiErrorMessage(outputJson) || 'Failed to load productivity inputs.');
      }
      if (!metricsRes.ok || !metricsJson.ok) {
        throw new Error(getApiErrorMessage(metricsJson) || 'Failed to load productivity metrics.');
      }

      setOutput(outputJson.data);
      setMetrics(metricsJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load productivity data');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!output) return;
    setPlannedM2(output.plannedM2 !== null ? String(output.plannedM2) : '');
    setVariationM2(output.variationM2 !== null ? String(output.variationM2) : '');
    setClaimedM2(output.claimedM2 !== null ? String(output.claimedM2) : '');
    setAcceptedM2(output.acceptedM2 !== null ? String(output.acceptedM2) : '');
    setReworkM2(output.reworkM2 !== null ? String(output.reworkM2) : '');
    setAccessDifficulty(output.complexityAccessDifficulty ? String(output.complexityAccessDifficulty) : '');
    setHeightLift(output.complexityHeightLiftRequirement ? String(output.complexityHeightLiftRequirement) : '');
    setPanelHandling(output.complexityPanelHandlingSize ? String(output.complexityPanelHandlingSize) : '');
    setSiteConstraints(output.complexitySiteConstraints ? String(output.complexitySiteConstraints) : '');
    setDetailingComplexity(output.complexityDetailingComplexity ? String(output.complexityDetailingComplexity) : '');
    setDefectCount(String(output.qualityDefectCount ?? 0));
    setCallbackFlag(Boolean(output.qualityCallbackFlag));
    setMissingDocsFlag(Boolean(output.qualityMissingDocsFlag));
    setSafetyFlag(Boolean(output.qualitySafetyFlag));
  }, [output]);

  useEffect(() => {
    if (!metricModalKey) return;
    setMetricModalData(null);
    let active = true;
    const loadComparison = async () => {
      setMetricModalLoading(true);
      setMetricModalError(null);
      try {
        const res = await fetch(
          `/api/install-productivity/compare?orgId=${props.orgId}&jobId=${props.jobId}&metric=${metricModalKey}`
        );
        const json = (await res.json()) as ApiResponse<MetricCompareResponse>;
        if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to load comparison');
        if (active) setMetricModalData(json.data);
      } catch (e) {
        if (active) setMetricModalError(e instanceof Error ? e.message : 'Failed to load comparison');
      } finally {
        if (active) setMetricModalLoading(false);
      }
    };
    void loadComparison();
    return () => {
      active = false;
    };
  }, [metricModalKey, props.jobId, props.orgId]);

  const handleSaveOutputs = async () => {
    setSavingOutput(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        orgId: props.orgId,
        jobId: props.jobId,
        claimedM2: parseNumber(claimedM2),
        reworkM2: parseNumber(reworkM2),
      };
      if (canManage) {
        payload.plannedM2 = parseNumber(plannedM2);
        payload.variationM2 = parseNumber(variationM2, true);
        payload.acceptedM2 = parseNumber(acceptedM2);
      }

      const res = await fetch('/api/job-productivity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<JobProductivityPayload>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to save outputs');
      setOutput(json.data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save outputs');
    } finally {
      setSavingOutput(false);
    }
  };

  const handleSaveQuality = async () => {
    if (!canManage) return;
    setSavingQuality(true);
    setError(null);
    try {
      const payload = {
        orgId: props.orgId,
        jobId: props.jobId,
        complexityAccessDifficulty: parseNumber(accessDifficulty),
        complexityHeightLiftRequirement: parseNumber(heightLift),
        complexityPanelHandlingSize: parseNumber(panelHandling),
        complexitySiteConstraints: parseNumber(siteConstraints),
        complexityDetailingComplexity: parseNumber(detailingComplexity),
        qualityDefectCount: parseNumber(defectCount) ?? 0,
        qualityCallbackFlag: callbackFlag,
        qualityMissingDocsFlag: missingDocsFlag,
        qualitySafetyFlag: safetyFlag,
      };

      const res = await fetch('/api/job-productivity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<JobProductivityPayload>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to save quality');
      setOutput(json.data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save quality');
    } finally {
      setSavingQuality(false);
    }
  };

  const flags = metrics?.metrics.flags ?? [];
  const waitingBreakdown = metrics?.metrics.waitingMinutesByReason ?? {};
  const waitingReasons = Object.entries(waitingBreakdown).filter(([, minutes]) => minutes > 0);

  const modalMetric = metricModalData?.metric;
  const modalWindow = metricModalData?.windows?.[metricWindow];
  const modalUnit = modalMetric?.unit ?? 'rate';
  const jobValueLabel = modalMetric ? formatMetricValue(modalMetric.unit, metricModalData?.job.value ?? 0) : '--';

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Install productivity</h2>
          <p className="text-xs text-text-tertiary">Accepted output and person-minute metrics.</p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Output tracking</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Planned m2"
              inputMode="decimal"
              value={plannedM2}
              onChange={(e) => setPlannedM2(e.target.value)}
              disabled={!canManage || savingOutput}
            />
            <Input
              label="Variation m2"
              inputMode="decimal"
              value={variationM2}
              onChange={(e) => setVariationM2(e.target.value)}
              disabled={!canManage || savingOutput}
            />
            <Input
              label="Claimed m2 (provisional)"
              inputMode="decimal"
              value={claimedM2}
              onChange={(e) => setClaimedM2(e.target.value)}
              disabled={savingOutput}
            />
            <Input
              label="Accepted m2 (QA)"
              inputMode="decimal"
              value={acceptedM2}
              onChange={(e) => setAcceptedM2(e.target.value)}
              disabled={!canManage || savingOutput}
            />
            <Input
              label="Rework m2"
              inputMode="decimal"
              value={reworkM2}
              onChange={(e) => setReworkM2(e.target.value)}
              disabled={savingOutput}
            />
          </div>
          {output?.acceptedM2ApprovedAt && (
            <p className="text-xs text-text-tertiary">
              QA approved at {new Date(output.acceptedM2ApprovedAt).toLocaleString()}
            </p>
          )}
          <p className="text-xs text-text-tertiary">
            Accepted m2 drives productivity metrics. Claim values are provisional until QA approval.
          </p>
          <Button onClick={handleSaveOutputs} disabled={savingOutput}>
            {savingOutput ? 'Saving...' : 'Save outputs'}
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Complexity scoring</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Access difficulty" value={accessDifficulty} onChange={(e) => setAccessDifficulty(e.target.value)} disabled={!canManage || savingQuality}>
              <option value="">Not set</option>
              {complexityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <Select label="Height / lift" value={heightLift} onChange={(e) => setHeightLift(e.target.value)} disabled={!canManage || savingQuality}>
              <option value="">Not set</option>
              {complexityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <Select label="Panel handling size" value={panelHandling} onChange={(e) => setPanelHandling(e.target.value)} disabled={!canManage || savingQuality}>
              <option value="">Not set</option>
              {complexityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <Select label="Site constraints" value={siteConstraints} onChange={(e) => setSiteConstraints(e.target.value)} disabled={!canManage || savingQuality}>
              <option value="">Not set</option>
              {complexityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <Select label="Detailing complexity" value={detailingComplexity} onChange={(e) => setDetailingComplexity(e.target.value)} disabled={!canManage || savingQuality}>
              <option value="">Not set</option>
              {complexityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
          </div>

          <h3 className="text-sm font-semibold text-text-primary pt-2">Quality inputs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="QA defects"
              inputMode="numeric"
              value={defectCount}
              onChange={(e) => setDefectCount(e.target.value)}
              disabled={!canManage || savingQuality}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={callbackFlag}
                onChange={(e) => setCallbackFlag(e.target.checked)}
                disabled={!canManage || savingQuality}
              />
              Callback within {callbackDays} days
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={missingDocsFlag}
                onChange={(e) => setMissingDocsFlag(e.target.checked)}
                disabled={!canManage || savingQuality}
              />
              Missing required docs
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={safetyFlag}
                onChange={(e) => setSafetyFlag(e.target.checked)}
                disabled={!canManage || savingQuality}
              />
              Safety non-compliance
            </label>
          </div>
          <Button onClick={handleSaveQuality} disabled={!canManage || savingQuality}>
            {savingQuality ? 'Saving...' : 'Save complexity & quality'}
          </Button>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Productivity metrics</h3>
            <p className="text-xs text-text-tertiary">All rates use accepted m2 and person-minutes.</p>
          </div>
        </div>

        {!metrics ? (
          <p className="text-sm text-text-secondary">Metrics unavailable.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {METRIC_CARDS.slice(0, 3).map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setMetricModalKey(card.key)}
                  className="rounded-md bg-bg-section/30 p-4 text-left border border-transparent hover:border-accent-gold/60 transition-colors"
                >
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">{card.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{formatRate(card.value(metrics.metrics))}</p>
                  <p className="text-xs text-text-tertiary">{card.subtitle(metrics.metrics)}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {METRIC_CARDS.slice(3, 6).map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setMetricModalKey(card.key)}
                  className="rounded-md bg-bg-section/30 p-4 text-left border border-transparent hover:border-accent-gold/60 transition-colors"
                >
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold text-text-primary">{formatRate(card.value(metrics.metrics))}</p>
                  <p className="text-xs text-text-tertiary">{card.subtitle(metrics.metrics)}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {METRIC_CARDS.slice(6).map((card) => {
                const value = card.value(metrics.metrics);
                const displayValue = card.key === 'waiting_pct' || card.key === 'rework_pct'
                  ? `${Math.round(value)}m`
                  : formatRate(value);
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setMetricModalKey(card.key)}
                    className="rounded-md bg-bg-section/30 p-4 text-left border border-transparent hover:border-accent-gold/60 transition-colors"
                  >
                    <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">{card.label}</p>
                    <p className="mt-1 text-xl font-semibold text-text-primary">{displayValue}</p>
                    <p className="text-xs text-text-tertiary">{card.subtitle(metrics.metrics)}</p>
                    {card.key === 'waiting_pct' && waitingReasons.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {waitingReasons.map(([reason, minutes]) => (
                          <div key={reason} className="text-xs text-text-secondary">
                            {delayReasonLabels[reason] ?? reason}: {Math.round(minutes)}m
                          </div>
                        ))}
                      </div>
                    )}
                    {card.key === 'rework_pct' && (
                      <p className="text-xs text-text-tertiary mt-2">
                        Accepted m2 net of rework: {formatM2(metrics.metrics.acceptedM2Net)} m2
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {metrics.legacy && (
              <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Legacy rate</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatRate(metrics.legacy.m2PerMinute)} m2/min</p>
                <p className="text-xs text-text-tertiary">
                  {formatM2(metrics.legacy.totalM2)} m2 over {Math.round(metrics.legacy.totalMinutes)} min (source: {metrics.legacy.source})
                </p>
              </div>
            )}

            <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Manager flags</p>
              {flags.length === 0 ? (
                <p className="text-sm text-text-secondary mt-2">No flags detected.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {flags.map((flag) => (
                    <div
                      key={flag.code}
                      className={`text-sm ${flag.severity === 'warn' ? 'text-amber-400' : 'text-text-secondary'}`}
                    >
                      {flag.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {metricModalKey && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMetricModalKey(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Card className="w-full max-w-3xl max-h-[85vh] overflow-y-auto border border-border-subtle bg-bg-base">
              <div className="p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                      {modalMetric ? `${modalMetric.label} (${modalMetric.abbreviation})` : 'Metric comparison'}
                    </h3>
                    <p className="text-xs text-text-tertiary mt-1">
                      {metricModalKey ? METRIC_DESCRIPTIONS[metricModalKey] : 'Comparing this job to company averages.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setMetricModalKey(null)}>
                      Close
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setMetricModalKey(metricModalKey)}
                      disabled={metricModalLoading}
                    >
                      {metricModalLoading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                </div>

                {metricModalError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {metricModalError}
                  </div>
                )}

                <div className="rounded-md border border-border-subtle bg-bg-section/30 p-4">
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">This job</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{jobValueLabel}</p>
                  <p className="text-xs text-text-tertiary">{metricModalData?.job.title ?? 'Job'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(['days7', 'days30', 'days90'] as const).map((key) => {
                    const window = metricModalData?.windows?.[key];
                    const average = window?.average ?? 0;
                    const delta = (metricModalData?.job.value ?? 0) - average;
                    return (
                      <div key={key} className="rounded-md border border-border-subtle bg-bg-section/20 p-3">
                        <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">{key.replace('days', '')}d avg</p>
                        <p className="mt-1 text-lg font-semibold text-text-primary">
                          {formatMetricValue(modalUnit, average)}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Delta: {formatMetricDelta(modalUnit, delta)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <Chip active={metricWindow === 'days7'} onClick={() => setMetricWindow('days7')}>
                    7d
                  </Chip>
                  <Chip active={metricWindow === 'days30'} onClick={() => setMetricWindow('days30')}>
                    30d
                  </Chip>
                  <Chip active={metricWindow === 'days90'} onClick={() => setMetricWindow('days90')}>
                    90d
                  </Chip>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Top jobs</p>
                    {metricModalLoading ? (
                      <p className="text-sm text-text-secondary mt-2">Loading leaderboard...</p>
                    ) : modalWindow?.jobs?.length ? (
                      <div className="mt-3 space-y-2">
                        {modalWindow.jobs.map((row, index) => (
                          <div key={row.id} className="flex items-center justify-between text-sm">
                            <span className="text-text-secondary">{index + 1}. {row.name}</span>
                            <span className="font-semibold text-text-primary">
                              {formatMetricValue(modalUnit, row.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary mt-2">No job leaderboard yet.</p>
                    )}
                  </div>
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Top crew</p>
                    {metricModalLoading ? (
                      <p className="text-sm text-text-secondary mt-2">Loading leaderboard...</p>
                    ) : modalWindow?.employees?.length ? (
                      <div className="mt-3 space-y-2">
                        {modalWindow.employees.map((row, index) => (
                          <div key={row.id} className="flex items-center justify-between text-sm">
                            <span className="text-text-secondary">{index + 1}. {row.name}</span>
                            <span className="font-semibold text-text-primary">
                              {formatMetricValue(modalUnit, row.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary mt-2">No crew leaderboard for this metric.</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </Card>
  );
}
