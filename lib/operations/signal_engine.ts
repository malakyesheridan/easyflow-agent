/**
 * Operations Intelligence Signal Engine
 *
 * Signal format (every rule must emit this shape):
 * - id: deterministic id (stable across refreshes)
 * - type: 'job' | 'crew' | 'system'
 * - severity: 'info' | 'warning' | 'critical'
 * - entityType/entityId: primary owner (job or crew)
 * - title/description: short, human readable explanation
 * - headline/reason: short, human readable explanation
 * - detectedAt: when this signal became true (Date)
 * - metadata: object with the data that triggered the rule
 * - evidence: object with the data that triggered the rule
 * - recommendedActions: ordered list of next steps
 * - deepLinks: links to open the relevant job/crew/route
 * - createdAt: when this signal became true (Date)
 *
 * To add a new signal:
 * 1) Add a new rule block in buildOperationsSignals.
 * 2) Construct a deterministic id (prefix + entity id).
 * 3) Keep evidence minimal and explainable.
 * 4) Prefer reusing job/crew data from inputs instead of new queries.
 */

import type { OperationsMapCrew, OperationsMapJob } from '@/lib/types/operations_map';
import type {
  OperationsSignalDeepLink,
  OperationsSignalEntityType,
  OperationsSignalSeverity,
  OperationsSignalType,
} from '@/lib/types/operations_intelligence';
import { detectOverlaps } from '@/lib/utils/scheduleConflicts';

export type SignalAssignment = {
  id: string;
  jobId: string;
  crewId: string | null;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledStart: Date;
  scheduledEnd: Date;
};

export type CrewSwapEvent = {
  eventId: string;
  assignmentId: string;
  jobId: string;
  previousCrewId: string;
  nextCrewId: string;
  changedAt: Date;
};

type JobFinancialSnapshot = {
  profitabilityStatus: 'healthy' | 'warning' | 'critical';
  targetMarginPercent: number | null;
  estimatedRevenueCents: number | null;
  estimatedCostCents: number | null;
};

type JobInvoiceSnapshot = {
  invoiceId: string;
  status: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  currency: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  isOverdue: boolean;
};

export type SignalCandidate = {
  id: string;
  type: OperationsSignalType;
  severity: OperationsSignalSeverity;
  title: string;
  description: string;
  entityType: OperationsSignalEntityType;
  entityId: string;
  detectedAt: Date;
  metadata?: Record<string, unknown>;
  headline: string;
  reason: string;
  evidence: Record<string, unknown>;
  recommendedActions: string[];
  deepLinks: OperationsSignalDeepLink[];
  createdAt: Date;
};

type SignalEngineInput = {
  now: Date;
  jobs: OperationsMapJob[];
  crews: OperationsMapCrew[];
  assignments: SignalAssignment[];
  crewSwapEvents: CrewSwapEvent[];
  lastActivityByJobId: Map<string, Date | null>;
  jobUpdatedAtById: Map<string, Date | null>;
  usageByJobId: Map<string, number>;
  lastHoursLogByJobId: Map<string, Date | null>;
  lastMaterialsLogByJobId: Map<string, Date | null>;
  hoursByJobId: Map<string, number>;
  plannedMaterialsByJobId: Map<string, number>;
  jobFinancialsById: Map<string, JobFinancialSnapshot>;
  jobInvoiceById: Map<string, JobInvoiceSnapshot>;
  thresholds: {
    lateRiskMinutes: number;
    idleThresholdMinutes: number;
    staleLocationMinutes: number;
    riskRadiusKm: number;
    noProgressMinutes: number;
    noMaterialsMinutes: number;
    enRouteDelayMinutes: number;
    hoursOverageMultiplier: number;
    timeRiskCriticalMultiplier: number;
    defaultJobDurationMinutes: number;
    marginWarningPercent: number;
    marginCriticalPercent: number;
    unassignedWarningDays: number;
    crewSwapWindowMinutes: number;
  };
};

const SEVERITY_WEIGHT: Record<OperationsSignalSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function latestDate(...values: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value.getTime() > latest.getTime()) {
      latest = value;
    }
  }
  return latest;
}

function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!earliest || value.getTime() < earliest.getTime()) {
      earliest = value;
    }
  }
  return earliest;
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '0m';
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatCurrency(cents: number, currency: string): string {
  const amount = Math.max(0, Number(cents ?? 0)) / 100;
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

function buildMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildRouteUrl(origin: { lat: number; lng: number }, destination: string): string {
  const originValue = `${origin.lat},${origin.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originValue)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const calc =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(calc), Math.sqrt(1 - calc)));
}

function resolveCrewCoords(crew: OperationsMapCrew, jobById: Map<string, OperationsMapJob>): { lat: number; lng: number } | null {
  if (crew.location.lat !== null && crew.location.lng !== null) {
    return { lat: crew.location.lat, lng: crew.location.lng };
  }
  if (crew.location.jobId) {
    const job = jobById.get(crew.location.jobId);
    if (job && job.latitude !== null && job.longitude !== null) {
      return { lat: job.latitude, lng: job.longitude };
    }
  }
  return null;
}

function buildJobDeepLinks(params: {
  job: OperationsMapJob;
  crew: OperationsMapCrew | null;
  crewCoords: { lat: number; lng: number } | null;
}): OperationsSignalDeepLink[] {
  const links: OperationsSignalDeepLink[] = [
    { label: 'Open Job', href: `/jobs/${params.job.id}` },
  ];

  if (params.crew) {
    links.push({ label: 'Open Crew', href: `/crews/${params.crew.id}` });
  }

  if (params.job.address && params.crewCoords) {
    links.push({
      label: 'Open Route',
      href: buildRouteUrl(params.crewCoords, params.job.address),
      external: true,
    });
  } else if (params.job.address) {
    links.push({
      label: 'Open Route',
      href: buildMapsSearchUrl(params.job.address),
      external: true,
    });
  }

  return links;
}

function buildCrewDeepLinks(params: {
  crew: OperationsMapCrew;
  job: OperationsMapJob | null;
  crewCoords: { lat: number; lng: number } | null;
}): OperationsSignalDeepLink[] {
  const links: OperationsSignalDeepLink[] = [
    { label: 'Open Crew', href: `/crews/${params.crew.id}` },
  ];

  if (params.job) {
    links.push({ label: 'Open Job', href: `/jobs/${params.job.id}` });
  }

  if (params.job?.address && params.crewCoords) {
    links.push({
      label: 'Open Route',
      href: buildRouteUrl(params.crewCoords, params.job.address),
      external: true,
    });
  } else if (params.job?.address) {
    links.push({
      label: 'Open Route',
      href: buildMapsSearchUrl(params.job.address),
      external: true,
    });
  }

  return links;
}

type SignalDraft = Omit<
  SignalCandidate,
  'type' | 'title' | 'description' | 'detectedAt' | 'metadata'
> & {
  type?: OperationsSignalType;
  title?: string;
  description?: string;
  detectedAt?: Date;
  metadata?: Record<string, unknown>;
};

function buildSignalCandidate(draft: SignalDraft): SignalCandidate {
  return {
    ...draft,
    type: draft.type ?? draft.entityType,
    title: draft.title ?? draft.headline,
    description: draft.description ?? draft.reason,
    detectedAt: draft.detectedAt ?? draft.createdAt,
    metadata: draft.metadata ?? draft.evidence,
  };
}

export function buildOperationsSignals(input: SignalEngineInput): SignalCandidate[] {
  const {
    now,
    jobs,
    crews,
    assignments,
    crewSwapEvents,
    lastActivityByJobId,
    jobUpdatedAtById,
    usageByJobId,
    lastHoursLogByJobId,
    lastMaterialsLogByJobId,
    hoursByJobId,
    plannedMaterialsByJobId,
    jobFinancialsById,
    jobInvoiceById,
    thresholds,
  } = input;
  const nowMs = now.getTime();

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const crewById = new Map(crews.map((crew) => [crew.id, crew]));
  const lastAssignmentByCrewId = new Map<string, SignalAssignment | null>();

  const activeAssignments = assignments.filter((assignment) => assignment.status !== 'cancelled');
  for (const assignment of activeAssignments) {
    if (!assignment.crewId) continue;
    const current = lastAssignmentByCrewId.get(assignment.crewId);
    if (!current || assignment.scheduledEnd.getTime() > current.scheduledEnd.getTime()) {
      lastAssignmentByCrewId.set(assignment.crewId, assignment);
    }
  }

  const jobScheduleById = new Map<
    string,
    { plannedMinutes: number; earliestStart: Date | null; latestEnd: Date | null }
  >();
  for (const assignment of activeAssignments) {
    const durationMinutes = Math.max(0, assignment.endMinutes - assignment.startMinutes);
    const current = jobScheduleById.get(assignment.jobId) ?? {
      plannedMinutes: 0,
      earliestStart: null,
      latestEnd: null,
    };
    current.plannedMinutes += durationMinutes;
    if (!current.earliestStart || assignment.scheduledStart < current.earliestStart) {
      current.earliestStart = assignment.scheduledStart;
    }
    if (!current.latestEnd || assignment.scheduledEnd > current.latestEnd) {
      current.latestEnd = assignment.scheduledEnd;
    }
    jobScheduleById.set(assignment.jobId, current);
  }

  const signals: SignalCandidate[] = [];

  // Scheduled but unassigned: schedule exists with no crew.
  for (const job of jobs) {
    if (job.status === 'completed' || job.progressStatus === 'completed') continue;
    if (job.scheduleState !== 'scheduled_unassigned') continue;

    const schedule = jobScheduleById.get(job.id);
    const scheduledStart = schedule?.earliestStart ?? toDate(job.scheduledStart);
    const scheduledEnd = schedule?.latestEnd ?? toDate(job.scheduledEnd);
    if (!scheduledStart || !scheduledEnd) continue;

    const minutesToStart = Math.round((scheduledStart.getTime() - nowMs) / 60000);
    const windowMinutes = Math.max(0, thresholds.unassignedWarningDays * 24 * 60);
    const withinWindow = windowMinutes > 0 && minutesToStart <= windowMinutes;
    const severity: OperationsSignalSeverity =
      minutesToStart <= 0 ? 'critical' : withinWindow ? 'warning' : 'info';

    const headline = withinWindow
      ? `Crew unassigned close to start: ${job.title}`
      : `Scheduled without crew: ${job.title}`;
    const reason = minutesToStart <= 0
      ? 'Scheduled start has passed with no crew assigned.'
      : withinWindow
        ? `Scheduled start is within ${thresholds.unassignedWarningDays} day${thresholds.unassignedWarningDays === 1 ? '' : 's'} and no crew is assigned.`
        : 'Job is scheduled without a crew assignment.';

    const signalId = withinWindow ? `unassigned_near_start:job:${job.id}` : `scheduled_unassigned:job:${job.id}`;

    signals.push(buildSignalCandidate({
      id: signalId,
      severity,
      entityType: 'job',
      entityId: job.id,
      headline,
      reason,
      evidence: {
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        minutesToStart,
        unassignedWarningDays: thresholds.unassignedWarningDays,
      },
      recommendedActions: [
        'Assign a crew to the scheduled window.',
        'Confirm the schedule if the job can proceed without a crew.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: null, crewCoords: null }),
      createdAt: now,
    }));
  }

  // Crew swaps close to execution time.
  if (crewSwapEvents.length > 0 && thresholds.crewSwapWindowMinutes > 0) {
    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    for (const swap of crewSwapEvents) {
      const assignment = assignmentById.get(swap.assignmentId);
      if (!assignment) continue;
      const job = jobById.get(swap.jobId) ?? jobById.get(assignment.jobId) ?? null;
      if (!job || job.status === 'completed' || job.progressStatus === 'completed') continue;

      const scheduledStart = assignment.scheduledStart;
      const minutesFromStart = Math.abs(minutesBetween(swap.changedAt, scheduledStart));
      if (minutesFromStart > thresholds.crewSwapWindowMinutes) continue;

      const previousCrew = crewById.get(swap.previousCrewId) ?? null;
      const nextCrew = crewById.get(swap.nextCrewId) ?? null;
      const crewForLinks = nextCrew ?? previousCrew;
      const crewCoords = crewForLinks ? resolveCrewCoords(crewForLinks, jobById) : null;

      signals.push(buildSignalCandidate({
        id: `crew_swap:assignment:${swap.eventId}`,
        severity: 'warning',
        entityType: 'job',
        entityId: job.id,
        headline: `Crew swap near start: ${job.title}`,
        reason: `Crew changed within ${formatMinutes(minutesFromStart)} of the scheduled start.`,
        evidence: {
          assignmentId: assignment.id,
          previousCrewId: swap.previousCrewId,
          previousCrewName: previousCrew?.name ?? null,
          nextCrewId: swap.nextCrewId,
          nextCrewName: nextCrew?.name ?? null,
          scheduledStart: scheduledStart.toISOString(),
          changedAt: swap.changedAt.toISOString(),
          windowMinutes: thresholds.crewSwapWindowMinutes,
        },
        recommendedActions: [
          'Confirm the new crew has received the job details.',
          'Notify the client if the change impacts arrival time.',
        ],
        deepLinks: buildJobDeepLinks({ job, crew: crewForLinks ?? null, crewCoords }),
        createdAt: swap.changedAt,
      }));
    }
  }

  // Late risk: scheduled start is within threshold and crew is not en route.
  for (const job of jobs) {
    if (job.status === 'completed' || job.progressStatus === 'completed') continue;
    const scheduledStart = toDate(job.scheduledStart);
    if (!scheduledStart) continue;
    const minutesToStart = Math.round((scheduledStart.getTime() - nowMs) / 60000);
    if (Math.abs(minutesToStart) > thresholds.lateRiskMinutes) continue;

    const crewIds = job.crew.map((c) => c.id);
    const crewStates = crewIds
      .map((crewId) => crewById.get(crewId)?.state)
      .filter((state): state is OperationsMapCrew['state'] => Boolean(state));
    const crewEnRoute = crewStates.some((state) => state === 'en_route' || state === 'on_job');
    if (crewEnRoute) continue;

    const primaryCrew = crewIds[0] ? crewById.get(crewIds[0]) ?? null : null;
    const crewCoords = primaryCrew ? resolveCrewCoords(primaryCrew, jobById) : null;
    const severity: OperationsSignalSeverity = minutesToStart <= 0 ? 'critical' : 'warning';

    signals.push(buildSignalCandidate({
      id: `late_risk:job:${job.id}`,
      severity,
      entityType: 'job',
      entityId: job.id,
      headline: `Late risk for ${job.title}`,
      reason: crewIds.length === 0 ? 'Start window is near and no crew is assigned.' : 'Start window is near and crew is not en route.',
      evidence: {
        scheduledStart: scheduledStart.toISOString(),
        minutesToStart,
        crewIds,
        crewStates,
        progressStatus: job.progressStatus,
      },
      recommendedActions: [
        'Confirm crew ETA and travel status.',
        'Assign a nearby crew or update the schedule start.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: primaryCrew, crewCoords }),
      createdAt: scheduledStart,
    }));
  }

  // Job stalled: in progress but no updates for threshold minutes.
  for (const job of jobs) {
    if (!(job.status === 'in_progress' || job.progressStatus === 'in_progress' || job.progressStatus === 'half_complete')) continue;
    const activityUpdate = latestDate(
      lastActivityByJobId.get(job.id) ?? null,
      jobUpdatedAtById.get(job.id) ?? null,
      lastHoursLogByJobId.get(job.id) ?? null,
      lastMaterialsLogByJobId.get(job.id) ?? null
    );
    const schedule = jobScheduleById.get(job.id);
    const scheduledStart = schedule?.earliestStart ?? toDate(job.scheduledStart);
    const lastUpdate = activityUpdate ?? scheduledStart;
    if (!lastUpdate) continue;
    const minutesSince = minutesBetween(lastUpdate, now);
    if (minutesSince < thresholds.noProgressMinutes) continue;

    const crewIds = job.crew.map((c) => c.id);
    const primaryCrew = crewIds[0] ? crewById.get(crewIds[0]) ?? null : null;
    const crewCoords = primaryCrew ? resolveCrewCoords(primaryCrew, jobById) : null;

    signals.push(buildSignalCandidate({
      id: `no_progress:job:${job.id}`,
      severity: 'warning',
      entityType: 'job',
      entityId: job.id,
      headline: `Job stalled on ${job.title}`,
      reason: `No updates logged for ${formatMinutes(minutesSince)}.`,
      evidence: {
        lastActivityAt: activityUpdate ? activityUpdate.toISOString() : null,
        lastHoursAt: lastHoursLogByJobId.get(job.id)?.toISOString() ?? null,
        lastMaterialsAt: lastMaterialsLogByJobId.get(job.id)?.toISOString() ?? null,
        lastUpdateAt: lastUpdate.toISOString(),
        minutesSince,
        progressStatus: job.progressStatus,
      },
      recommendedActions: [
        'Request an update from the crew.',
        'Log progress, hours, or materials to confirm status.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: primaryCrew, crewCoords }),
      createdAt: new Date(lastUpdate.getTime() + thresholds.noProgressMinutes * 60000),
    }));
  }

  // Job at risk (time): actual hours or elapsed time exceed expectations.
  for (const job of jobs) {
    if (!(job.status === 'in_progress' || job.progressStatus === 'in_progress' || job.progressStatus === 'half_complete')) continue;
    const schedule = jobScheduleById.get(job.id);
    const plannedMinutes = schedule?.plannedMinutes ?? 0;
    const scheduledStart = schedule?.earliestStart ?? toDate(job.scheduledStart);
    const scheduledEnd = schedule?.latestEnd ?? toDate(job.scheduledEnd);
    const expectedMinutes =
      plannedMinutes > 0
        ? plannedMinutes
        : scheduledStart && scheduledEnd
          ? Math.max(0, minutesBetween(scheduledStart, scheduledEnd))
          : thresholds.defaultJobDurationMinutes;

    const actualMinutes = hoursByJobId.get(job.id) ?? 0;
    const hoursRatio = plannedMinutes > 0 ? actualMinutes / plannedMinutes : null;
    const hoursOver =
      plannedMinutes > 0 &&
      actualMinutes > plannedMinutes * thresholds.hoursOverageMultiplier;

    const elapsedMinutes = scheduledStart ? minutesBetween(scheduledStart, now) : null;
    const elapsedOver = elapsedMinutes !== null && elapsedMinutes > expectedMinutes;

    if (!hoursOver && !elapsedOver) continue;

    const criticalByHours =
      hoursRatio !== null && hoursRatio >= thresholds.timeRiskCriticalMultiplier;
    const criticalByElapsed =
      elapsedMinutes !== null &&
      elapsedMinutes >= expectedMinutes * thresholds.timeRiskCriticalMultiplier;
    const severity: OperationsSignalSeverity = criticalByHours || criticalByElapsed ? 'critical' : 'warning';

    const reasonParts: string[] = [];
    if (hoursOver) {
      const deltaMinutes = actualMinutes - plannedMinutes;
      reasonParts.push(
        `Logged ${formatMinutes(actualMinutes)} vs planned ${formatMinutes(plannedMinutes)} (+${formatMinutes(deltaMinutes)}).`
      );
    }
    if (elapsedOver && elapsedMinutes !== null) {
      const deltaMinutes = elapsedMinutes - expectedMinutes;
      reasonParts.push(
        `Elapsed ${formatMinutes(elapsedMinutes)} vs expected ${formatMinutes(expectedMinutes)} (+${formatMinutes(deltaMinutes)}).`
      );
    }

    const detectionTimes: Array<Date | null> = [
      hoursOver ? lastHoursLogByJobId.get(job.id) ?? now : null,
      elapsedOver && scheduledStart
        ? new Date(scheduledStart.getTime() + expectedMinutes * 60000)
        : null,
    ];
    const createdAt = earliestDate(...detectionTimes) ?? now;

    const crewIds = job.crew.map((c) => c.id);
    const primaryCrew = crewIds[0] ? crewById.get(crewIds[0]) ?? null : null;
    const crewCoords = primaryCrew ? resolveCrewCoords(primaryCrew, jobById) : null;

    signals.push(buildSignalCandidate({
      id: `time_risk:job:${job.id}`,
      severity,
      entityType: 'job',
      entityId: job.id,
      headline: `Time risk on ${job.title}`,
      reason: reasonParts.join(' '),
      evidence: {
        plannedMinutes,
        actualMinutes,
        hoursRatio: hoursRatio !== null ? Number(hoursRatio.toFixed(2)) : null,
        expectedMinutes,
        elapsedMinutes,
        hoursOverageMultiplier: thresholds.hoursOverageMultiplier,
        timeRiskCriticalMultiplier: thresholds.timeRiskCriticalMultiplier,
        scheduledStart: scheduledStart ? scheduledStart.toISOString() : null,
        scheduledEnd: scheduledEnd ? scheduledEnd.toISOString() : null,
      },
      recommendedActions: [
        'Review labour allocation and time spent on this job.',
        'Update the plan or schedule additional support if needed.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: primaryCrew, crewCoords }),
      createdAt,
    }));
  }

  // Materials risk: job in progress with planned materials but no usage logged.
  for (const job of jobs) {
    if (!(job.status === 'in_progress' || job.progressStatus === 'in_progress' || job.progressStatus === 'half_complete')) continue;
    const plannedCount = plannedMaterialsByJobId.get(job.id) ?? 0;
    if (plannedCount <= 0) continue;
    const usageCount = usageByJobId.get(job.id) ?? 0;
    if (usageCount > 0) continue;

    const schedule = jobScheduleById.get(job.id);
    const scheduledStart = schedule?.earliestStart ?? toDate(job.scheduledStart);
    const minutesSinceStart = scheduledStart ? minutesBetween(scheduledStart, now) : null;

    const crewIds = job.crew.map((c) => c.id);
    const primaryCrew = crewIds[0] ? crewById.get(crewIds[0]) ?? null : null;
    const crewCoords = primaryCrew ? resolveCrewCoords(primaryCrew, jobById) : null;

    signals.push(buildSignalCandidate({
      id: `no_materials:job:${job.id}`,
      severity: 'warning',
      entityType: 'job',
      entityId: job.id,
      headline: `Materials missing on ${job.title}`,
      reason: `Job is in progress with ${plannedCount} planned material allocations, but none logged.`,
      evidence: {
        plannedCount,
        usageCount,
        scheduledStart: scheduledStart ? scheduledStart.toISOString() : null,
        minutesSinceStart,
        progressStatus: job.progressStatus,
      },
      recommendedActions: [
        'Log materials used for this job.',
        'Confirm material availability with the crew.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: primaryCrew, crewCoords }),
      createdAt: scheduledStart ?? now,
    }));
  }

  // Margin risk: real-time or projected margin below thresholds/target.
  for (const job of jobs) {
    if (job.status === 'completed' || job.progressStatus === 'completed') continue;
    const financials = jobFinancialsById.get(job.id);
    if (!financials) continue;
    const invoiceSnapshot = jobInvoiceById.get(job.id) ?? null;

    const { estimatedRevenueCents, estimatedCostCents, profitabilityStatus, targetMarginPercent } = financials;
    const estimatedMarginPercent =
      estimatedRevenueCents !== null && estimatedRevenueCents > 0 && estimatedCostCents !== null
        ? ((estimatedRevenueCents - estimatedCostCents) / estimatedRevenueCents) * 100
        : null;

    const realTimeRisk = profitabilityStatus === 'warning' || profitabilityStatus === 'critical';
    const projectedRisk =
      estimatedMarginPercent !== null && estimatedMarginPercent <= thresholds.marginWarningPercent;
    const belowTarget =
      estimatedMarginPercent !== null &&
      targetMarginPercent !== null &&
      estimatedMarginPercent < targetMarginPercent;

    if (!realTimeRisk && !projectedRisk && !belowTarget) continue;

    const thresholdTriggered =
      estimatedMarginPercent !== null
        ? estimatedMarginPercent <= thresholds.marginCriticalPercent
          ? thresholds.marginCriticalPercent
          : thresholds.marginWarningPercent
        : null;

    const reasonParts: string[] = [];
    if (realTimeRisk) reasonParts.push(`Real-time margin is ${profitabilityStatus}.`);
    if (estimatedMarginPercent !== null && targetMarginPercent !== null) {
      reasonParts.push(
        `Estimated margin ${estimatedMarginPercent.toFixed(1)}% vs target ${targetMarginPercent.toFixed(1)}%.`
      );
    } else if (estimatedMarginPercent !== null) {
      reasonParts.push(`Estimated margin ${estimatedMarginPercent.toFixed(1)}%.`);
    }
    if (projectedRisk && thresholdTriggered !== null) {
      reasonParts.push(`Projected margin is below ${thresholdTriggered.toFixed(1)}%.`);
    }
    if (invoiceSnapshot && invoiceSnapshot.outstandingCents > 0) {
      reasonParts.push(
        `Outstanding invoice balance ${formatCurrency(invoiceSnapshot.outstandingCents, invoiceSnapshot.currency)}.`
      );
    }

    const crewIds = job.crew.map((c) => c.id);
    const primaryCrew = crewIds[0] ? crewById.get(crewIds[0]) ?? null : null;
    const crewCoords = primaryCrew ? resolveCrewCoords(primaryCrew, jobById) : null;
    const marginAnchor =
      latestDate(
        jobUpdatedAtById.get(job.id) ?? null,
        lastHoursLogByJobId.get(job.id) ?? null,
        lastMaterialsLogByJobId.get(job.id) ?? null
      ) ?? now;

    signals.push(buildSignalCandidate({
      id: `margin_risk:job:${job.id}`,
      severity: 'critical',
      entityType: 'job',
      entityId: job.id,
      headline: `Margin risk on ${job.title}`,
      reason: reasonParts.join(' '),
      evidence: {
        profitabilityStatus,
        estimatedMarginPercent: estimatedMarginPercent !== null ? Number(estimatedMarginPercent.toFixed(1)) : null,
        targetMarginPercent,
        marginWarningPercent: thresholds.marginWarningPercent,
        marginCriticalPercent: thresholds.marginCriticalPercent,
        invoiceOutstandingCents: invoiceSnapshot?.outstandingCents ?? null,
        invoiceStatus: invoiceSnapshot?.status ?? null,
      },
      recommendedActions: [
        'Review job costs and revenue assumptions.',
        'Adjust scope or pricing to protect margin.',
        ...(invoiceSnapshot?.outstandingCents ?? 0) > 0 ? ['Follow up on the outstanding invoice to reduce cashflow risk.'] : [],
      ],
      deepLinks: buildJobDeepLinks({ job, crew: primaryCrew, crewCoords }),
      createdAt: marginAnchor,
    }));
  }

  // Completed but unpaid: job finished with outstanding invoice balance.
  for (const job of jobs) {
    if (job.status !== 'completed' && job.progressStatus !== 'completed') continue;
    const invoiceSnapshot = jobInvoiceById.get(job.id);
    if (!invoiceSnapshot) continue;
    const invoiceStatus = String(invoiceSnapshot.status ?? '').toLowerCase();
    if (invoiceStatus === 'draft' || invoiceStatus === 'void') continue;
    if (invoiceSnapshot.outstandingCents <= 0) continue;

    const overdue = invoiceSnapshot.isOverdue;
    const severity: OperationsSignalSeverity = overdue ? 'critical' : 'warning';
    const outstandingLabel = formatCurrency(invoiceSnapshot.outstandingCents, invoiceSnapshot.currency);
    const reason = overdue
      ? `Job completed with overdue balance of ${outstandingLabel}.`
      : `Job completed with unpaid balance of ${outstandingLabel}.`;

    signals.push(buildSignalCandidate({
      id: `completed_unpaid:job:${job.id}`,
      severity,
      entityType: 'job',
      entityId: job.id,
      headline: `Completed but unpaid: ${job.title}`,
      reason,
      evidence: {
        invoiceId: invoiceSnapshot.invoiceId,
        invoiceStatus: invoiceSnapshot.status,
        totalCents: invoiceSnapshot.totalCents,
        paidCents: invoiceSnapshot.paidCents,
        outstandingCents: invoiceSnapshot.outstandingCents,
        currency: invoiceSnapshot.currency,
        issuedAt: invoiceSnapshot.issuedAt ? invoiceSnapshot.issuedAt.toISOString() : null,
        dueAt: invoiceSnapshot.dueAt ? invoiceSnapshot.dueAt.toISOString() : null,
        paidAt: invoiceSnapshot.paidAt ? invoiceSnapshot.paidAt.toISOString() : null,
        overdue: overdue,
      },
      recommendedActions: [
        'Follow up with the client to confirm payment timing.',
        'Record any external payment received (EFT, cash, POS).',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: null, crewCoords: null }),
      createdAt: invoiceSnapshot.dueAt ?? invoiceSnapshot.issuedAt ?? now,
    }));
  }

  // Idle crew nearby: idle crew within radius of an at-risk job.
  const idleCrews = crews.filter(
    (crew) =>
      crew.state === 'idle' &&
      crew.active &&
      crew.idleMinutes !== null &&
      crew.idleMinutes >= thresholds.idleThresholdMinutes
  );
  for (const job of jobs.filter((candidate) => candidate.risk.atRisk)) {
    if (job.latitude === null || job.longitude === null) continue;
    const jobCoords = { lat: job.latitude, lng: job.longitude };
    const matches = idleCrews
      .map((crew) => {
        const crewCoords = resolveCrewCoords(crew, jobById);
        if (!crewCoords) return null;
        const distance = distanceKm(jobCoords, crewCoords);
        if (distance > thresholds.riskRadiusKm) return null;
        return {
          crew,
          crewCoords,
          distanceKm: Number(distance.toFixed(2)),
        };
      })
      .filter((match): match is { crew: OperationsMapCrew; crewCoords: { lat: number; lng: number }; distanceKm: number } => Boolean(match))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (matches.length === 0) continue;

    const nearest = matches[0];
    signals.push(buildSignalCandidate({
      id: `idle_crew_nearby:job:${job.id}`,
      severity: 'info',
      entityType: 'job',
      entityId: job.id,
      headline: `Idle crew near ${job.title}`,
      reason: `There are ${matches.length} idle crew within ${thresholds.riskRadiusKm} km.`,
      evidence: {
        radiusKm: thresholds.riskRadiusKm,
        crewMatches: matches.slice(0, 3).map((match) => ({
          crewId: match.crew.id,
          crewName: match.crew.name,
          distanceKm: match.distanceKm,
          idleMinutes: match.crew.idleMinutes,
        })),
      },
      recommendedActions: [
        'Assign the nearest idle crew to this job.',
        'Check if the crew can assist with current risk.',
      ],
      deepLinks: buildJobDeepLinks({ job, crew: nearest.crew, crewCoords: nearest.crewCoords }),
      createdAt: now,
    }));
  }

  // Crew idle too long: idle beyond threshold.
  for (const crew of crews) {
    if (!crew.active || crew.state !== 'idle') continue;
    const idleMinutes = crew.idleMinutes ?? 0;
    if (idleMinutes < thresholds.idleThresholdMinutes) continue;

    const severity: OperationsSignalSeverity =
      idleMinutes >= thresholds.idleThresholdMinutes * 2 ? 'warning' : 'info';
    const job = crew.nextJobId ? jobById.get(crew.nextJobId) ?? null : null;
    const crewCoords = resolveCrewCoords(crew, jobById);
    const createdAt = new Date(
      now.getTime() - Math.max(0, idleMinutes - thresholds.idleThresholdMinutes) * 60000
    );

    signals.push(buildSignalCandidate({
      id: `idle_too_long:crew:${crew.id}`,
      severity,
      entityType: 'crew',
      entityId: crew.id,
      headline: `Crew idle too long: ${crew.name}`,
      reason: `Idle for ${formatMinutes(idleMinutes)} with no active assignment.`,
      evidence: {
        idleMinutes,
        idleThresholdMinutes: thresholds.idleThresholdMinutes,
        state: crew.state,
        nextJobId: crew.nextJobId ?? null,
      },
      recommendedActions: [
        'Assign the crew to the next priority job.',
        'Confirm availability and update shift status if needed.',
      ],
      deepLinks: buildCrewDeepLinks({ crew, job, crewCoords }),
      createdAt,
    }));
  }

  // Crew en route too long: exceeded expected travel window.
  for (const crew of crews) {
    if (!crew.active || crew.state !== 'en_route') continue;
    const nextJobStart = toDate(crew.nextJobStart);
    if (!nextJobStart) continue;
    const minutesPastStart = minutesBetween(nextJobStart, now);
    if (minutesPastStart < thresholds.enRouteDelayMinutes) continue;

    const job = crew.nextJobId ? jobById.get(crew.nextJobId) ?? null : null;
    const crewCoords = resolveCrewCoords(crew, jobById);
    const locationHint = crew.location.address ? ` Last known location: ${crew.location.address}.` : '';

    signals.push(buildSignalCandidate({
      id: `en_route_delay:crew:${crew.id}`,
      severity: 'warning',
      entityType: 'crew',
      entityId: crew.id,
      headline: `Crew en route too long: ${crew.name}`,
      reason: `En route for ${formatMinutes(minutesPastStart)} past scheduled start.${locationHint}`,
      evidence: {
        nextJobId: crew.nextJobId ?? null,
        nextJobStart: nextJobStart.toISOString(),
        minutesPastStart,
        enRouteDelayMinutes: thresholds.enRouteDelayMinutes,
        lastLocation: crew.location,
      },
      recommendedActions: [
        'Check crew location and ETA.',
        'Update the job start or reassign if the delay continues.',
      ],
      deepLinks: buildCrewDeepLinks({ crew, job, crewCoords }),
      createdAt: new Date(nextJobStart.getTime() + thresholds.enRouteDelayMinutes * 60000),
    }));
  }

  // Stale location: crew location older than threshold minutes.
  for (const crew of crews) {
    if (!crew.active || crew.state === 'off_shift') continue;
    const lastAssignment = lastAssignmentByCrewId.get(crew.id) ?? null;
    const lastLocationAt = lastAssignment?.scheduledEnd ?? null;
    const crewCoords = resolveCrewCoords(crew, jobById);
    if (!lastLocationAt && crew.location.source === 'none') {
      signals.push(buildSignalCandidate({
        id: `stale_location:crew:${crew.id}`,
        severity: 'warning',
        entityType: 'crew',
        entityId: crew.id,
        headline: `Stale location for ${crew.name}`,
        reason: 'No recent location updates are available.',
        evidence: {
          lastLocationAt: null,
          locationSource: crew.location.source,
        },
        recommendedActions: [
          'Request a location update from the crew.',
          'Confirm the crew is checked in.',
        ],
        deepLinks: buildCrewDeepLinks({ crew, job: null, crewCoords }),
        createdAt: now,
      }));
      continue;
    }

    if (!lastLocationAt) continue;
    const minutesStale = minutesBetween(lastLocationAt, now);
    if (minutesStale < thresholds.staleLocationMinutes) continue;

    signals.push(buildSignalCandidate({
      id: `stale_location:crew:${crew.id}`,
      severity: minutesStale >= thresholds.staleLocationMinutes * 2 ? 'critical' : 'warning',
      entityType: 'crew',
      entityId: crew.id,
      headline: `Stale location for ${crew.name}`,
      reason: `Last location update was ${minutesStale} minutes ago.`,
      evidence: {
        lastLocationAt: lastLocationAt.toISOString(),
        minutesStale,
        locationSource: crew.location.source,
      },
      recommendedActions: [
        'Check in with the crew for an update.',
        'Verify travel or job status.',
      ],
      deepLinks: buildCrewDeepLinks({ crew, job: null, crewCoords }),
      createdAt: new Date(lastLocationAt.getTime() + thresholds.staleLocationMinutes * 60000),
    }));
  }

  // Schedule conflict: overlapping assignments for a crew on the same day.
  const assignmentsByCrewDay = new Map<string, SignalAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.status === 'cancelled' || assignment.status === 'completed') continue;
    if (!assignment.crewId) continue;
    const dayKey = assignment.date.toISOString().slice(0, 10);
    const key = `${assignment.crewId}:${dayKey}`;
    const list = assignmentsByCrewDay.get(key) ?? [];
    list.push(assignment);
    assignmentsByCrewDay.set(key, list);
  }

  for (const [key, crewAssignments] of assignmentsByCrewDay) {
    const [crewId, dayKey] = key.split(':');
    const crew = crewById.get(crewId);
    if (!crew) continue;
    const overlapMap = detectOverlaps(crewAssignments);
    for (const [assignmentId, conflicts] of overlapMap.entries()) {
      const base = crewAssignments.find((assignment) => assignment.id === assignmentId);
      if (!base) continue;
      for (const conflictId of conflicts) {
        if (assignmentId > conflictId) continue;
        const conflict = crewAssignments.find((assignment) => assignment.id === conflictId);
        if (!conflict) continue;
        const jobA = jobById.get(base.jobId);
        const jobB = jobById.get(conflict.jobId);
        const overlapMinutes = Math.max(
          0,
          Math.min(base.endMinutes, conflict.endMinutes) - Math.max(base.startMinutes, conflict.startMinutes)
        );
        const createdAt = base.scheduledStart < conflict.scheduledStart ? conflict.scheduledStart : base.scheduledStart;
        const crewCoords = resolveCrewCoords(crew, jobById);

        signals.push(buildSignalCandidate({
          id: `schedule_conflict:crew:${crewId}:${[assignmentId, conflictId].sort().join(':')}`,
          severity: 'warning',
          entityType: 'crew',
          entityId: crewId,
          headline: `Schedule conflict for ${crew.name}`,
          reason: `${jobA?.title ?? 'Assignment'} overlaps ${jobB?.title ?? 'another job'} by ${overlapMinutes} minutes (${dayKey}).`,
          evidence: {
            day: dayKey,
            overlapMinutes,
            assignments: [
              {
                assignmentId: base.id,
                jobId: base.jobId,
                jobTitle: jobA?.title ?? null,
                scheduledStart: base.scheduledStart.toISOString(),
                scheduledEnd: base.scheduledEnd.toISOString(),
              },
              {
                assignmentId: conflict.id,
                jobId: conflict.jobId,
                jobTitle: jobB?.title ?? null,
                scheduledStart: conflict.scheduledStart.toISOString(),
                scheduledEnd: conflict.scheduledEnd.toISOString(),
              },
            ],
          },
          recommendedActions: [
            'Reschedule one of the overlapping jobs.',
            'Split the crew or adjust travel buffers.',
          ],
          deepLinks: buildCrewDeepLinks({
            crew,
            job: jobA ?? jobB ?? null,
            crewCoords,
          }),
          createdAt,
        }));
      }
    }
  }

  return signals.sort((a, b) => {
    const severityDelta = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
