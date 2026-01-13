import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { getOrgDayKey } from '@/lib/utils/scheduleDayOwnership';

export type DashboardMode = 'today' | 'week' | 'month' | 'year';

/**
 * Fetch window for schedule assignments.
 * Includes enough history to compute current + previous period comparisons.
 */
export function getRangeForMode(mode: DashboardMode, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  if (mode === 'today') {
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (mode === 'week') {
    start.setDate(start.getDate() - 14);
    return { start, end };
  }
  if (mode === 'month') {
    start.setDate(start.getDate() - 60);
    return { start, end };
  }
  start.setDate(start.getDate() - 730);
  return { start, end };
}

export function getPeriodLengthDays(mode: DashboardMode): number {
  if (mode === 'week') return 7;
  if (mode === 'month') return 30;
  if (mode === 'year') return 365;
  return 1;
}

export function buildOrgDayKeySet(now: Date, days: number): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < days; i++) {
    keys.add(getOrgDayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

export function deltaPercent(
  current: number,
  previous: number
): { direction: 'up' | 'down' | 'flat'; percent: number | null } {
  if (current === previous) return { direction: 'flat', percent: 0 };
  if (previous === 0) return { direction: current > 0 ? 'up' : 'flat', percent: null };
  const raw = ((current - previous) / previous) * 100;
  return { direction: raw > 0 ? 'up' : 'down', percent: Math.abs(raw) };
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getJobById(jobs: Job[]): Map<string, Job> {
  return new Map(jobs.map((j) => [j.id, j]));
}

export function computeTodayMetrics(params: { now: Date; jobs: Job[]; assignments: ScheduleAssignmentWithJob[] }) {
  const { now, jobs, assignments } = params;
  const todayKey = getOrgDayKey(now);

  const todaysAssignments = assignments.filter((a) => getOrgDayKey(a.date) === todayKey);

  const scheduledJobIds = new Set(todaysAssignments.map((a) => a.jobId));
  const crewsActive = new Set(todaysAssignments.map((a) => a.crewId).filter((crewId): crewId is string => Boolean(crewId)));

  const completedToday = jobs.filter((j) => j.status === 'completed' && getOrgDayKey(j.updatedAt) === todayKey);

  const overdueAssignments = todaysAssignments.filter((a) => {
    const jobCompleted = a.job?.status === 'completed';
    const assignmentCompleted = a.status === 'completed';
    if (jobCompleted || assignmentCompleted) return false;
    return now.getTime() > new Date(a.scheduledEnd).getTime();
  });

  return {
    jobsScheduledToday: scheduledJobIds.size,
    jobsCompletedToday: completedToday.length,
    crewsActiveToday: crewsActive.size,
    jobsOverdue: overdueAssignments.length,
  };
}

export function computePeriodMetrics(params: {
  now: Date;
  mode: Exclude<DashboardMode, 'today'>;
  jobs: Job[];
  assignments: ScheduleAssignmentWithJob[];
}) {
  const { now, mode, jobs, assignments } = params;
  const days = getPeriodLengthDays(mode);

  const currentKeys = buildOrgDayKeySet(now, days);
  const previousKeys = buildOrgDayKeySet(new Date(now.getTime() - days * 24 * 60 * 60 * 1000), days);

  const jobById = getJobById(jobs);

  const currentAssignments = assignments.filter((a) => currentKeys.has(getOrgDayKey(a.date)));
  const previousAssignments = assignments.filter((a) => previousKeys.has(getOrgDayKey(a.date)));

  const currentJobIds = new Set(currentAssignments.map((a) => a.jobId));
  const previousJobIds = new Set(previousAssignments.map((a) => a.jobId));

  const currentCrewIds = new Set(currentAssignments.map((a) => a.crewId).filter((crewId): crewId is string => Boolean(crewId)));

  const completedNowCount = [...currentJobIds].filter((jobId) => jobById.get(jobId)?.status === 'completed').length;
  const completionPct = currentJobIds.size === 0 ? 0 : Math.round((completedNowCount / currentJobIds.size) * 100);

  const avgDurationMinutes =
    currentAssignments.length === 0
      ? 0
      : Math.round(currentAssignments.reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0) / currentAssignments.length);

  const avgJobsPerCrew = currentCrewIds.size === 0 ? 0 : Number((currentJobIds.size / currentCrewIds.size).toFixed(2));

  return {
    totalJobs: currentJobIds.size,
    completionPct,
    averageJobDurationMinutes: avgDurationMinutes,
    averageJobsPerCrew: avgJobsPerCrew,
    trend: deltaPercent(currentJobIds.size, previousJobIds.size),
  };
}
