import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { getOrgDayKey } from '@/lib/utils/scheduleDayOwnership';
import { buildOrgDayKeySet, deltaPercent } from '@/lib/utils/dashboardMetrics';

export type CrewStatus = 'inactive' | 'on_job_now' | 'active';

export type CrewCardMetrics = {
  crewId: string;
  status: CrewStatus;
  today: {
    scheduledJobs: number;
    completedJobs: number;
    utilisationPct: number;
    overdueJobs: number;
  };
  week: {
    completedJobs: number;
    utilisationPct: number;
    trendCompletedVsPrev: { direction: 'up' | 'down' | 'flat'; percent: number | null };
  };
};

export function getCrewDisplayName(member: CrewMember): string {
  return member.displayName || `${member.firstName} ${member.lastName}`.trim();
}

export function computeCrewCardMetrics(params: {
  now: Date;
  crew: CrewMember;
  assignments: ScheduleAssignmentWithJob[];
}): CrewCardMetrics {
  const { now, crew, assignments } = params;
  const todayKey = getOrgDayKey(now);

  const todaysAssignments = assignments.filter(
    (a) => a.crewId === crew.id && getOrgDayKey(a.date) === todayKey
  );

  const scheduledJobIds = new Set(todaysAssignments.map(a => a.jobId));
  const completedJobIds = new Set(todaysAssignments.filter(a => a.status === 'completed').map(a => a.jobId));

  const totalScheduledMinutes = todaysAssignments.reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0);
  const capacityMinutes = Math.max(1, crew.dailyCapacityMinutes || 8 * 60);
  const utilisationPct = Math.max(0, Math.min(100, Math.round((totalScheduledMinutes / capacityMinutes) * 100)));

  const overdueJobs = todaysAssignments.filter(a => {
    if (a.status === 'completed') return false;
    const end = new Date(a.scheduledEnd).getTime();
    return now.getTime() > end;
  });
  const overdueJobIds = new Set(overdueJobs.map(a => a.jobId));

  const isOnJobNow = crew.active && todaysAssignments.some(a => {
    if (a.status === 'completed') return false;
    const start = new Date(a.scheduledStart).getTime();
    const end = new Date(a.scheduledEnd).getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  });

  const status: CrewStatus = crew.active ? (isOnJobNow ? 'on_job_now' : 'active') : 'inactive';

  const currentWeekKeys = buildOrgDayKeySet(now, 7);
  const prevWeekKeys = buildOrgDayKeySet(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), 7);

  const weekAssignments = assignments.filter(a => a.crewId === crew.id && currentWeekKeys.has(getOrgDayKey(a.date)));
  const prevWeekAssignments = assignments.filter(a => a.crewId === crew.id && prevWeekKeys.has(getOrgDayKey(a.date)));

  const weekCompletedJobIds = new Set(weekAssignments.filter(a => a.status === 'completed').map(a => a.jobId));
  const prevWeekCompletedJobIds = new Set(prevWeekAssignments.filter(a => a.status === 'completed').map(a => a.jobId));

  const weekMinutes = weekAssignments.reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0);
  const weekCapacity = capacityMinutes * 5; // rough "work week" baseline
  const weekUtilisationPct = Math.max(0, Math.min(100, Math.round((weekMinutes / Math.max(1, weekCapacity)) * 100)));

  return {
    crewId: crew.id,
    status,
    today: {
      scheduledJobs: scheduledJobIds.size,
      completedJobs: completedJobIds.size,
      utilisationPct,
      overdueJobs: overdueJobIds.size,
    },
    week: {
      completedJobs: weekCompletedJobIds.size,
      utilisationPct: weekUtilisationPct,
      trendCompletedVsPrev: deltaPercent(weekCompletedJobIds.size, prevWeekCompletedJobIds.size),
    },
  };
}

export function getInitials(displayName: string): string {
  const parts = displayName.split(' ').filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase() || '?';
}

