import {
  computeComplexityMultiplier,
  computeComplexityScore,
  computeEmployeePeriodMetrics,
  computeJobMetrics,
  computeQualityMultiplier,
  computeQualityScore,
  type JobMetrics,
  type TimeEntry,
} from '@/lib/metrics/installProductivity';
import type { Job } from '@/db/schema/jobs';
import { toNumber } from '@/lib/utils/quantity';

export type MetricKey =
  | 'nir'
  | 'str'
  | 'cir'
  | 'ca_nir'
  | 'qa_nir'
  | 'cqa_nir'
  | 'waiting_pct'
  | 'rework_pct';

export type MetricDefinition = {
  key: MetricKey;
  abbreviation: string;
  label: string;
  unit: 'rate' | 'percent';
  employeeEligible: boolean;
};

export type WindowKey = 'days7' | 'days30' | 'days90';

export type LeaderboardRow = {
  id: string;
  value: number;
  installMinutes?: number;
  attributedM2?: number;
};

export type WindowInsights = {
  average: number;
  jobLeaderboard: LeaderboardRow[];
  employeeLeaderboard?: LeaderboardRow[];
};

export type MetricInsights = Record<WindowKey, WindowInsights>;

const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  nir: {
    key: 'nir',
    abbreviation: 'NIR',
    label: 'Net Install Rate',
    unit: 'rate',
    employeeEligible: true,
  },
  str: {
    key: 'str',
    abbreviation: 'STR',
    label: 'Site Throughput Rate',
    unit: 'rate',
    employeeEligible: false,
  },
  cir: {
    key: 'cir',
    abbreviation: 'CIR',
    label: 'Crew Install Rate',
    unit: 'rate',
    employeeEligible: false,
  },
  ca_nir: {
    key: 'ca_nir',
    abbreviation: 'CA-NIR',
    label: 'Complexity Adjusted Net Install Rate',
    unit: 'rate',
    employeeEligible: true,
  },
  qa_nir: {
    key: 'qa_nir',
    abbreviation: 'QA-NIR',
    label: 'Quality Adjusted Net Install Rate',
    unit: 'rate',
    employeeEligible: true,
  },
  cqa_nir: {
    key: 'cqa_nir',
    abbreviation: 'CQA-NIR',
    label: 'Complexity + Quality Adjusted Net Install Rate',
    unit: 'rate',
    employeeEligible: true,
  },
  waiting_pct: {
    key: 'waiting_pct',
    abbreviation: 'WAIT',
    label: 'Waiting Time Share',
    unit: 'percent',
    employeeEligible: false,
  },
  rework_pct: {
    key: 'rework_pct',
    abbreviation: 'REWORK',
    label: 'Rework Time Share',
    unit: 'percent',
    employeeEligible: false,
  },
};

const WINDOW_DAYS: Record<WindowKey, number> = {
  days7: 7,
  days30: 30,
  days90: 90,
};

export function resolveMetricKey(raw: string | null | undefined): MetricKey | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return (Object.keys(METRIC_DEFINITIONS) as MetricKey[]).find((key) => key === normalized) ?? null;
}

export function getMetricDefinition(key: MetricKey): MetricDefinition {
  return METRIC_DEFINITIONS[key];
}

export function computeMetricValue(metrics: JobMetrics, key: MetricKey): number {
  switch (key) {
    case 'nir':
      return metrics.nir;
    case 'str':
      return metrics.str;
    case 'cir':
      return metrics.cir;
    case 'ca_nir':
      return metrics.caNir;
    case 'qa_nir':
      return metrics.qaNir;
    case 'cqa_nir':
      return metrics.cqaNir;
    case 'waiting_pct':
      return metrics.waitingMinutesPct;
    case 'rework_pct':
      return metrics.reworkMinutesPct;
    default:
      return 0;
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function getEntryMinutes(entry: TimeEntry): number {
  const start = toDate(entry.startTime ?? null);
  const end = toDate(entry.endTime ?? null);
  if (start && end) return diffMinutes(start, end);
  const minutes = toNumber(entry.minutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function entryInRange(entry: TimeEntry, start: Date, end: Date): boolean {
  const entryStart = toDate(entry.startTime ?? entry.createdAt ?? null);
  const entryEnd = toDate(entry.endTime ?? null);
  if (!entryStart && !entryEnd) return false;
  if (entryStart && entryEnd) {
    return entryEnd >= start && entryStart <= end;
  }
  const point = entryStart ?? entryEnd;
  if (!point) return false;
  return point >= start && point <= end;
}

function buildEntriesByJob(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.jobId) ?? [];
    list.push(entry);
    map.set(entry.jobId, list);
  }
  return map;
}

function buildJobMetricsById(params: {
  entries: TimeEntry[];
  jobById: Map<string, Job>;
}): Map<string, JobMetrics> {
  const metricsByJob = new Map<string, JobMetrics>();
  const entriesByJob = buildEntriesByJob(params.entries);
  for (const [jobId, jobEntries] of entriesByJob.entries()) {
    const job = params.jobById.get(jobId);
    if (!job) continue;
    metricsByJob.set(jobId, computeJobMetrics(job, jobEntries));
  }
  return metricsByJob;
}

function computeWindowAverage(metricsByJob: Map<string, JobMetrics>): {
  nir: number;
  str: number;
  cir: number;
  caNir: number;
  qaNir: number;
  cqaNir: number;
  waitingPct: number;
  reworkPct: number;
} {
  let acceptedM2NetTotal = 0;
  let installMinutesTotal = 0;
  let onsiteMinutesTotal = 0;
  let installWindowMinutesTotal = 0;
  let waitingMinutesTotal = 0;
  let reworkMinutesTotal = 0;
  let complexityWeighted = 0;
  let qualityWeighted = 0;

  for (const metrics of metricsByJob.values()) {
    const hasOnsite = metrics.onsitePersonMinutes > 0 || metrics.installPersonMinutes > 0;
    if (hasOnsite) {
      acceptedM2NetTotal += metrics.acceptedM2Net;
    }
    installMinutesTotal += metrics.installPersonMinutes;
    onsiteMinutesTotal += metrics.onsitePersonMinutes;
    installWindowMinutesTotal += metrics.crewInstallWindowMinutes;
    waitingMinutesTotal += metrics.waitingMinutes;
    reworkMinutesTotal += metrics.reworkMinutes;
    if (metrics.installPersonMinutes > 0) {
      complexityWeighted += metrics.installPersonMinutes * metrics.complexityMultiplier;
      qualityWeighted += metrics.installPersonMinutes * metrics.qualityMultiplier;
    }
  }

  const nir = installMinutesTotal > 0 ? acceptedM2NetTotal / installMinutesTotal : 0;
  const str = onsiteMinutesTotal > 0 ? acceptedM2NetTotal / onsiteMinutesTotal : 0;
  const cir = installWindowMinutesTotal > 0 ? acceptedM2NetTotal / installWindowMinutesTotal : 0;
  const complexityMultiplier = installMinutesTotal > 0 ? complexityWeighted / installMinutesTotal : 1;
  const qualityMultiplier = installMinutesTotal > 0 ? qualityWeighted / installMinutesTotal : 1;
  const caNir = complexityMultiplier > 0 ? nir / complexityMultiplier : 0;
  const qaNir = nir * qualityMultiplier;
  const cqaNir = complexityMultiplier > 0 ? (nir / complexityMultiplier) * qualityMultiplier : 0;
  const waitingPct = onsiteMinutesTotal > 0 ? waitingMinutesTotal / onsiteMinutesTotal : 0;
  const reworkPct = onsiteMinutesTotal > 0 ? reworkMinutesTotal / onsiteMinutesTotal : 0;

  return { nir, str, cir, caNir, qaNir, cqaNir, waitingPct, reworkPct };
}

function buildEmployeeLeaderboard(params: {
  entries: TimeEntry[];
  jobsById: Map<string, Job>;
  metric: MetricKey;
  windowStart: Date;
  windowEnd: Date;
}): LeaderboardRow[] {
  const employeeEligible = getMetricDefinition(params.metric).employeeEligible;
  if (!employeeEligible) return [];

  const metrics = computeEmployeePeriodMetrics({
    jobs: Array.from(params.jobsById.values()).map((job) => ({
      id: job.id,
      acceptedM2: job.acceptedM2,
      reworkM2: job.reworkM2,
    })),
    entries: params.entries,
    dateRange: { start: params.windowStart, end: params.windowEnd },
  });

  const weightsByCrew = new Map<string, { minutes: number; complexityTotal: number; qualityTotal: number }>();
  for (const entry of params.entries) {
    if (entry.bucket !== 'INSTALL' || !entry.crewMemberId) continue;
    if (!entryInRange(entry, params.windowStart, params.windowEnd)) continue;
    const minutes = getEntryMinutes(entry);
    if (minutes <= 0) continue;
    const job = params.jobsById.get(entry.jobId);
    if (!job) continue;
    const complexityMultiplier = computeComplexityMultiplier(computeComplexityScore(job));
    const qualityMultiplier = computeQualityMultiplier(computeQualityScore(job));
    const current = weightsByCrew.get(entry.crewMemberId) ?? { minutes: 0, complexityTotal: 0, qualityTotal: 0 };
    weightsByCrew.set(entry.crewMemberId, {
      minutes: current.minutes + minutes,
      complexityTotal: current.complexityTotal + minutes * complexityMultiplier,
      qualityTotal: current.qualityTotal + minutes * qualityMultiplier,
    });
  }

  return metrics
    .map((row) => {
      const weights = weightsByCrew.get(row.crewMemberId);
      const weightMinutes = weights?.minutes ?? row.installMinutes;
      const complexityMultiplier = weightMinutes > 0 ? (weights?.complexityTotal ?? 0) / weightMinutes : 1;
      const qualityMultiplier = weightMinutes > 0 ? (weights?.qualityTotal ?? 0) / weightMinutes : 1;
      let value = row.nir;
      if (params.metric === 'ca_nir') {
        value = complexityMultiplier > 0 ? row.nir / complexityMultiplier : 0;
      } else if (params.metric === 'qa_nir') {
        value = row.nir * qualityMultiplier;
      } else if (params.metric === 'cqa_nir') {
        value = complexityMultiplier > 0 ? (row.nir / complexityMultiplier) * qualityMultiplier : 0;
      }
      return {
        id: row.crewMemberId,
        value,
        installMinutes: row.installMinutes,
        attributedM2: row.attributedM2,
      };
    })
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function buildMetricInsights(params: {
  entries: TimeEntry[];
  jobs: Job[];
  metric: MetricKey;
  now?: Date;
  leaderboardSize?: number;
}): MetricInsights {
  const now = params.now ?? new Date();
  const jobById = new Map(params.jobs.map((job) => [job.id, job]));
  const leaderboardSize = params.leaderboardSize ?? 5;

  const insights = {} as MetricInsights;

  (Object.keys(WINDOW_DAYS) as WindowKey[]).forEach((windowKey) => {
    const days = WINDOW_DAYS[windowKey];
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const windowEntries = params.entries.filter((entry) => entryInRange(entry, start, now));
    const metricsByJob = buildJobMetricsById({ entries: windowEntries, jobById });
    const averages = computeWindowAverage(metricsByJob);

    const jobLeaderboard = Array.from(metricsByJob.entries())
      .map(([jobId, metrics]) => ({
        id: jobId,
        value: computeMetricValue(metrics, params.metric),
      }))
      .filter((row) => Number.isFinite(row.value) && row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, leaderboardSize);

    const employeeLeaderboard = buildEmployeeLeaderboard({
      entries: windowEntries,
      jobsById: jobById,
      metric: params.metric,
      windowStart: start,
      windowEnd: now,
    }).slice(0, leaderboardSize);

    let average = averages.nir;
    if (params.metric === 'str') average = averages.str;
    if (params.metric === 'cir') average = averages.cir;
    if (params.metric === 'ca_nir') average = averages.caNir;
    if (params.metric === 'qa_nir') average = averages.qaNir;
    if (params.metric === 'cqa_nir') average = averages.cqaNir;
    if (params.metric === 'waiting_pct') average = averages.waitingPct;
    if (params.metric === 'rework_pct') average = averages.reworkPct;

    insights[windowKey] = {
      average,
      jobLeaderboard,
      employeeLeaderboard: employeeLeaderboard.length > 0 ? employeeLeaderboard : undefined,
    };
  });

  return insights;
}
