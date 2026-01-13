import { toNumber } from '@/lib/utils/quantity';

export type JobTimeBucket = 'INSTALL' | 'SETUP' | 'PACKDOWN' | 'WAITING' | 'ADMIN' | 'TRAVEL' | 'REWORK';
export type JobDelayReason =
  | 'ACCESS_KEYS_NOT_READY'
  | 'DELIVERY_LATE_OR_WRONG'
  | 'WEATHER'
  | 'EQUIPMENT_LIFT_CRANE_WAIT'
  | 'SAFETY_PERMIT_INDUCTION'
  | 'CLIENT_CHANGE_SCOPE'
  | 'REWORK_DEFECT_FIX'
  | 'OTHER_WITH_NOTE';

export type JobOutput = {
  id?: string;
  plannedM2?: number | string | null;
  variationM2?: number | string | null;
  claimedM2?: number | string | null;
  acceptedM2?: number | string | null;
  reworkM2?: number | string | null;
  complexityAccessDifficulty?: number | string | null;
  complexityHeightLiftRequirement?: number | string | null;
  complexityPanelHandlingSize?: number | string | null;
  complexitySiteConstraints?: number | string | null;
  complexityDetailingComplexity?: number | string | null;
  qualityDefectCount?: number | string | null;
  qualityCallbackFlag?: boolean | null;
  qualityMissingDocsFlag?: boolean | null;
  qualitySafetyFlag?: boolean | null;
};

export type TimeEntry = {
  jobId: string;
  crewMemberId: string | null;
  minutes?: number | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  createdAt?: Date | string | null;
  bucket?: JobTimeBucket | null;
  delayReason?: JobDelayReason | null;
};

export type ProductivityFlag = {
  code: string;
  severity: 'info' | 'warn';
  message: string;
  data?: Record<string, number | string>;
};

export type JobMetrics = {
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
  waitingMinutesByReason: Record<JobDelayReason, number>;
  bucketMinutes: Record<JobTimeBucket, number>;
  unbucketedMinutes: number;
  installWindowStart: Date | null;
  installWindowEnd: Date | null;
  flags: ProductivityFlag[];
};

export type EmployeePeriodMetrics = {
  crewMemberId: string;
  installMinutes: number;
  attributedM2: number;
  nir: number;
};

export type ComplexityWeights = {
  accessDifficulty: number;
  heightLiftRequirement: number;
  panelHandlingSize: number;
  siteConstraints: number;
  detailingComplexity: number;
};

export type QualityPenalties = {
  defectPerCount: number;
  callback: number;
  rework: number;
  missingDocs: number;
  safety: number;
};

export type ProductivityThresholds = {
  installOveruseRatio: number;
  waitingOtherRatio: number;
  waitingOtherMinMinutes: number;
  claimedVarianceThresholdPercent: number;
  installWindowRateThreshold: number;
};

const DEFAULT_COMPLEXITY_WEIGHTS: ComplexityWeights = {
  accessDifficulty: 1,
  heightLiftRequirement: 1,
  panelHandlingSize: 1,
  siteConstraints: 1,
  detailingComplexity: 1,
};

const DEFAULT_QUALITY_PENALTIES: QualityPenalties = {
  defectPerCount: 2,
  callback: 10,
  rework: 5,
  missingDocs: 5,
  safety: 15,
};

const DEFAULT_THRESHOLDS: ProductivityThresholds = {
  installOveruseRatio: 0.9,
  waitingOtherRatio: 0.5,
  waitingOtherMinMinutes: 30,
  claimedVarianceThresholdPercent: 10,
  installWindowRateThreshold: 0.2,
};

const ONSITE_BUCKETS: JobTimeBucket[] = ['INSTALL', 'SETUP', 'PACKDOWN', 'WAITING', 'ADMIN', 'REWORK'];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function clampScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeComplexityMultiplier(score: number): number {
  const cs = clampScore(score, 1, 5);
  if (cs <= 1) return 1;
  if (cs >= 5) return 1.75;

  const lower = Math.floor(cs);
  const upper = Math.ceil(cs);
  const points: Record<number, number> = {
    1: 1,
    2: 1.1,
    3: 1.25,
    4: 1.45,
    5: 1.75,
  };

  if (lower === upper) return points[lower] ?? 1;
  const lowerMultiplier = points[lower] ?? 1;
  const upperMultiplier = points[upper] ?? 1;
  const ratio = (cs - lower) / (upper - lower);
  return lowerMultiplier + (upperMultiplier - lowerMultiplier) * ratio;
}

export function computeQualityMultiplier(score: number): number {
  if (!Number.isFinite(score)) return 0.75;
  if (score >= 95) return 1;
  if (score >= 90) return 0.97;
  if (score >= 80) return 0.9;
  return 0.75;
}

export function computeComplexityScore(
  job: JobOutput,
  weights: ComplexityWeights = DEFAULT_COMPLEXITY_WEIGHTS
): number {
  const factors = [
    { value: job.complexityAccessDifficulty, weight: weights.accessDifficulty },
    { value: job.complexityHeightLiftRequirement, weight: weights.heightLiftRequirement },
    { value: job.complexityPanelHandlingSize, weight: weights.panelHandlingSize },
    { value: job.complexitySiteConstraints, weight: weights.siteConstraints },
    { value: job.complexityDetailingComplexity, weight: weights.detailingComplexity },
  ];

  let totalWeight = 0;
  let total = 0;

  for (const factor of factors) {
    const value = toNumber(factor.value);
    if (!Number.isFinite(value) || value <= 0 || factor.weight <= 0) continue;
    total += clampScore(value, 1, 5) * factor.weight;
    totalWeight += factor.weight;
  }

  if (totalWeight <= 0) return 1;
  return clampScore(total / totalWeight, 1, 5);
}

export function computeQualityScore(
  job: JobOutput,
  penalties: QualityPenalties = DEFAULT_QUALITY_PENALTIES
): number {
  let score = 100;
  const defectCount = Math.max(0, Math.floor(toNumber(job.qualityDefectCount)));
  score -= defectCount * penalties.defectPerCount;
  if (job.qualityCallbackFlag) score -= penalties.callback;
  if (job.qualityMissingDocsFlag) score -= penalties.missingDocs;
  if (job.qualitySafetyFlag) score -= penalties.safety;
  if (toNumber(job.reworkM2) > 0) score -= penalties.rework;
  return clampScore(score, 0, 100);
}

function getEntryMinutes(entry: TimeEntry): number {
  const start = toDate(entry.startTime);
  const end = toDate(entry.endTime);
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

export function computeJobMetrics(
  job: JobOutput,
  entries: TimeEntry[],
  options?: {
    complexityWeights?: ComplexityWeights;
    qualityPenalties?: QualityPenalties;
    thresholds?: Partial<ProductivityThresholds>;
  }
): JobMetrics {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };
  const complexityScore = computeComplexityScore(job, options?.complexityWeights);
  const complexityMultiplier = computeComplexityMultiplier(complexityScore);
  const qualityScore = computeQualityScore(job, options?.qualityPenalties);
  const qualityMultiplier = computeQualityMultiplier(qualityScore);

  const bucketMinutes: Record<JobTimeBucket, number> = {
    INSTALL: 0,
    SETUP: 0,
    PACKDOWN: 0,
    WAITING: 0,
    ADMIN: 0,
    TRAVEL: 0,
    REWORK: 0,
  };

  const waitingMinutesByReason: Record<JobDelayReason, number> = {
    ACCESS_KEYS_NOT_READY: 0,
    DELIVERY_LATE_OR_WRONG: 0,
    WEATHER: 0,
    EQUIPMENT_LIFT_CRANE_WAIT: 0,
    SAFETY_PERMIT_INDUCTION: 0,
    CLIENT_CHANGE_SCOPE: 0,
    REWORK_DEFECT_FIX: 0,
    OTHER_WITH_NOTE: 0,
  };

  let unbucketedMinutes = 0;
  let installWindowStart: Date | null = null;
  let installWindowEnd: Date | null = null;

  for (const entry of entries) {
    const minutes = getEntryMinutes(entry);
    if (minutes <= 0) continue;
    if (!entry.bucket) {
      unbucketedMinutes += minutes;
      continue;
    }

    bucketMinutes[entry.bucket] += minutes;

    if (entry.bucket === 'WAITING' && entry.delayReason) {
      waitingMinutesByReason[entry.delayReason] += minutes;
    }

    if (entry.bucket === 'INSTALL') {
      const start = toDate(entry.startTime);
      const end = toDate(entry.endTime);
      if (start && (!installWindowStart || start < installWindowStart)) installWindowStart = start;
      if (end && (!installWindowEnd || end > installWindowEnd)) installWindowEnd = end;
    }
  }

  const installPersonMinutes = bucketMinutes.INSTALL;
  const onsitePersonMinutes = ONSITE_BUCKETS.reduce((sum, bucket) => sum + bucketMinutes[bucket], 0);
  const crewInstallWindowMinutes =
    installWindowStart && installWindowEnd ? diffMinutes(installWindowStart, installWindowEnd) : 0;

  const acceptedM2 = Math.max(0, toNumber(job.acceptedM2));
  const reworkM2 = Math.max(0, toNumber(job.reworkM2));
  const acceptedM2Net = Math.max(0, acceptedM2 - reworkM2);
  const plannedM2 = toNumber(job.plannedM2);
  const variationM2 = toNumber(job.variationM2);
  const claimedM2 = toNumber(job.claimedM2);

  const nir = installPersonMinutes > 0 ? acceptedM2Net / installPersonMinutes : 0;
  const str = onsitePersonMinutes > 0 ? acceptedM2Net / onsitePersonMinutes : 0;
  const cir = crewInstallWindowMinutes > 0 ? acceptedM2Net / crewInstallWindowMinutes : 0;
  const caNir = complexityMultiplier > 0 ? nir / complexityMultiplier : 0;
  const qaNir = nir * qualityMultiplier;
  const cqaNir = complexityMultiplier > 0 ? (nir / complexityMultiplier) * qualityMultiplier : 0;

  const reworkMinutes = bucketMinutes.REWORK;
  const waitingMinutes = bucketMinutes.WAITING;
  const reworkMinutesPct = onsitePersonMinutes > 0 ? reworkMinutes / onsitePersonMinutes : 0;
  const waitingMinutesPct = onsitePersonMinutes > 0 ? waitingMinutes / onsitePersonMinutes : 0;

  const flags: ProductivityFlag[] = [];

  if (unbucketedMinutes > 0) {
    flags.push({
      code: 'UNBUCKETED_TIME',
      severity: 'warn',
      message: 'Unbucketed time entries excluded from productivity metrics.',
      data: { minutes: Math.round(unbucketedMinutes) },
    });
  }

  if (onsitePersonMinutes > 0 && installPersonMinutes / onsitePersonMinutes > thresholds.installOveruseRatio) {
    flags.push({
      code: 'INSTALL_OVERUSE',
      severity: 'warn',
      message: 'Possible mis-bucketing: install minutes exceed threshold share of onsite time.',
      data: { installMinutes: Math.round(installPersonMinutes), onsiteMinutes: Math.round(onsitePersonMinutes) },
    });
  }

  const waitingOtherMinutes = waitingMinutesByReason.OTHER_WITH_NOTE;
  if (
    waitingMinutes >= thresholds.waitingOtherMinMinutes &&
    waitingOtherMinutes / Math.max(1, waitingMinutes) > thresholds.waitingOtherRatio
  ) {
    flags.push({
      code: 'WAITING_OTHER_OVERUSE',
      severity: 'info',
      message: 'Waiting time uses OTHER reason unusually often.',
      data: { waitingOtherMinutes: Math.round(waitingOtherMinutes), waitingMinutes: Math.round(waitingMinutes) },
    });
  }

  const planBase = plannedM2 + variationM2;
  if (planBase > 0 && claimedM2 > planBase * (1 + thresholds.claimedVarianceThresholdPercent / 100)) {
    flags.push({
      code: 'CLAIMED_EXCEEDS_PLAN',
      severity: 'warn',
      message: 'Claimed m2 exceeds planned plus variation beyond threshold.',
      data: { claimedM2, plannedM2, variationM2 },
    });
  }

  if (crewInstallWindowMinutes > 0 && acceptedM2Net > 0) {
    const installWindowRate = acceptedM2Net / crewInstallWindowMinutes;
    if (installWindowRate > thresholds.installWindowRateThreshold) {
      flags.push({
        code: 'INSTALL_WINDOW_OUTLIER',
        severity: 'warn',
        message: 'Install window minutes appear too small for accepted output.',
        data: { acceptedM2: acceptedM2Net, installWindowMinutes: Math.round(crewInstallWindowMinutes) },
      });
    }
  }

  return {
    acceptedM2,
    acceptedM2Net,
    plannedM2,
    variationM2,
    claimedM2,
    reworkM2,
    installPersonMinutes,
    onsitePersonMinutes,
    crewInstallWindowMinutes,
    nir,
    str,
    cir,
    complexityScore,
    complexityMultiplier,
    qualityScore,
    qualityMultiplier,
    caNir,
    qaNir,
    cqaNir,
    reworkMinutes,
    reworkMinutesPct,
    waitingMinutes,
    waitingMinutesPct,
    waitingMinutesByReason,
    bucketMinutes,
    unbucketedMinutes,
    installWindowStart,
    installWindowEnd,
    flags,
  };
}

export function computeEmployeePeriodMetrics(params: {
  jobs: Array<JobOutput & { id: string }>;
  entries: TimeEntry[];
  dateRange: { start: Date; end: Date };
}): EmployeePeriodMetrics[] {
  const jobById = new Map(params.jobs.map((job) => [job.id, job]));
  const entriesInRange = params.entries.filter((entry) =>
    entryInRange(entry, params.dateRange.start, params.dateRange.end)
  );

  const installMinutesByJob = new Map<string, number>();
  const installMinutesByJobAndCrew = new Map<string, Map<string, number>>();

  for (const entry of entriesInRange) {
    if (entry.bucket !== 'INSTALL') continue;
    if (!entry.crewMemberId) continue;
    const minutes = getEntryMinutes(entry);
    if (minutes <= 0) continue;
    const jobId = entry.jobId;
    installMinutesByJob.set(jobId, (installMinutesByJob.get(jobId) ?? 0) + minutes);
    const crewMap = installMinutesByJobAndCrew.get(jobId) ?? new Map<string, number>();
    crewMap.set(entry.crewMemberId, (crewMap.get(entry.crewMemberId) ?? 0) + minutes);
    installMinutesByJobAndCrew.set(jobId, crewMap);
  }

  const totalsByCrew = new Map<string, { installMinutes: number; attributedM2: number }>();

  for (const [jobId, totalInstallMinutes] of installMinutesByJob.entries()) {
    if (totalInstallMinutes <= 0) continue;
    const job = jobById.get(jobId);
    if (!job) continue;
    const acceptedM2 = Math.max(0, toNumber(job.acceptedM2));
    const reworkM2 = Math.max(0, toNumber(job.reworkM2));
    const acceptedM2Net = Math.max(0, acceptedM2 - reworkM2);
    if (acceptedM2Net <= 0) continue;

    const crewMap = installMinutesByJobAndCrew.get(jobId);
    if (!crewMap) continue;

    for (const [crewMemberId, minutes] of crewMap.entries()) {
      const ratio = minutes / totalInstallMinutes;
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      const m2Share = acceptedM2Net * ratio;
      const current = totalsByCrew.get(crewMemberId) ?? { installMinutes: 0, attributedM2: 0 };
      totalsByCrew.set(crewMemberId, {
        installMinutes: current.installMinutes + minutes,
        attributedM2: current.attributedM2 + m2Share,
      });
    }
  }

  return Array.from(totalsByCrew.entries()).map(([crewMemberId, totals]) => ({
    crewMemberId,
    installMinutes: totals.installMinutes,
    attributedM2: totals.attributedM2,
    nir: totals.installMinutes > 0 ? totals.attributedM2 / totals.installMinutes : 0,
  }));
}
