import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crewMembers } from '@/db/schema/crew_members';
import { jobs } from '@/db/schema/jobs';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { tasks } from '@/db/schema/tasks';
import { applyJobVisibility, canManageJobs, canManageSchedule, getCrewIdsForActor, getVisibilityMode, type RequestActor } from '@/lib/authz';
import { ok, err, type Result } from '@/lib/result';
import { buildFullAddress, getShortAddress } from '@/lib/utils/jobAddress';
import { assignmentToDateRange } from '@/lib/utils/scheduleTime';
import type { JobProgressStatus, JobStatus } from '@/lib/validators/jobs';
import type { OperationsMapCrew, OperationsMapJob, OperationsMapPayload } from '@/lib/types/operations_map';

type AssignmentRow = {
  id: string;
  jobId: string;
  crewId: string | null;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
};

type NormalizedAssignment = AssignmentRow & {
  scheduledStart: Date;
  scheduledEnd: Date;
};

type JobRow = {
  id: string;
  orgId: string;
  title: string;
  status: JobStatus;
  progressStatus: JobProgressStatus | null;
  crewId: string | null;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  flags: unknown;
  updatedAt: Date;
};

type CrewRow = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  active: boolean;
  defaultStartMinutes: number;
  defaultEndMinutes: number;
};

type TaskSummaryRow = {
  jobId: string;
  total: number;
  completedTotal: number;
  requiredTotal: number;
  requiredCompleted: number;
};

type UsageSummaryRow = {
  jobId: string;
  usageCount: number;
};

type JobLocation = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  shortAddress: string;
};

const DEFAULT_IDLE_THRESHOLD_MINUTES = 90;
const DEFAULT_RISK_WINDOW_MINUTES = 120;
const DEFAULT_EN_ROUTE_WINDOW_MINUTES = 60;

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeFlags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((flag) => String(flag)).filter(Boolean);
}

function progressPercentFromStatus(status: JobProgressStatus): number {
  if (status === 'completed') return 100;
  if (status === 'half_complete') return 50;
  if (status === 'in_progress') return 25;
  return 0;
}

function resolveIdleThreshold(): number {
  const raw = process.env.OPERATIONS_IDLE_THRESHOLD_MINUTES ?? process.env.NEXT_PUBLIC_OPERATIONS_IDLE_THRESHOLD_MINUTES;
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_IDLE_THRESHOLD_MINUTES;
}

function resolveRiskWindow(): number {
  const raw = process.env.OPERATIONS_RISK_WINDOW_MINUTES ?? process.env.NEXT_PUBLIC_OPERATIONS_RISK_WINDOW_MINUTES;
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_RISK_WINDOW_MINUTES;
}

function formatCrewName(crew: { displayName: string; firstName: string; lastName: string }): string {
  return crew.displayName || `${crew.firstName} ${crew.lastName}`.trim();
}

/**
 * Aggregate jobs, crews, and derived states for the operations map.
 */
export async function getOperationsMapData(params: {
  orgId: string;
  actor: RequestActor;
}): Promise<Result<OperationsMapPayload>> {
  try {
    const db = getDb();
    const now = new Date();
    const nowMs = now.getTime();
    const idleThresholdMinutes = resolveIdleThreshold();
    const riskWindowMinutes = resolveRiskWindow();

    const visibilityMode = getVisibilityMode(params.actor);
    const canViewAllCrews = visibilityMode === 'orgWide';
    const canManageScheduleFlag = canManageSchedule(params.actor);
    const canManageJobsFlag = canManageJobs(params.actor);
    const scopedCrewIds = canViewAllCrews ? [] : getCrewIdsForActor(params.actor);

    const assignmentConditions = [eq(scheduleAssignments.orgId, params.orgId)];
    if (!canViewAllCrews) {
      if (scopedCrewIds.length === 0) {
        assignmentConditions.push(sql`false`);
      } else {
        assignmentConditions.push(inArray(scheduleAssignments.crewId, scopedCrewIds));
      }
    }

    const assignmentRows = await db
      .select({
        id: scheduleAssignments.id,
        jobId: scheduleAssignments.jobId,
        crewId: scheduleAssignments.crewId,
        date: scheduleAssignments.date,
        startMinutes: scheduleAssignments.startMinutes,
        endMinutes: scheduleAssignments.endMinutes,
        status: scheduleAssignments.status,
      })
      .from(scheduleAssignments)
      .where(and(...assignmentConditions));

    const normalizedAssignments: NormalizedAssignment[] = assignmentRows.map((row) => {
      const date = row.date instanceof Date ? row.date : new Date(row.date);
      const { scheduledStart, scheduledEnd } = assignmentToDateRange(date, row.startMinutes, row.endMinutes);
      return {
        ...row,
        date,
        scheduledStart,
        scheduledEnd,
      };
    });

    const assignmentsByJobId = new Map<string, NormalizedAssignment[]>();
    const assignmentsByCrewId = new Map<string, NormalizedAssignment[]>();

    for (const assignment of normalizedAssignments) {
      const jobList = assignmentsByJobId.get(assignment.jobId) ?? [];
      jobList.push(assignment);
      assignmentsByJobId.set(assignment.jobId, jobList);

      if (assignment.crewId) {
        const crewList = assignmentsByCrewId.get(assignment.crewId) ?? [];
        crewList.push(assignment);
        assignmentsByCrewId.set(assignment.crewId, crewList);
      }
    }

    for (const list of assignmentsByJobId.values()) {
      list.sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
    }
    for (const list of assignmentsByCrewId.values()) {
      list.sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
    }

    const jobConditions = applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor);
    const jobRows = await db
      .select({
        id: jobs.id,
        orgId: jobs.orgId,
        title: jobs.title,
        status: jobs.status,
        progressStatus: jobs.progressStatus,
        crewId: jobs.crewId,
        addressLine1: jobs.addressLine1,
        addressLine2: jobs.addressLine2,
        suburb: jobs.suburb,
        state: jobs.state,
        postcode: jobs.postcode,
        country: jobs.country,
        latitude: jobs.latitude,
        longitude: jobs.longitude,
        scheduledStart: jobs.scheduledStart,
        scheduledEnd: jobs.scheduledEnd,
        flags: jobs.flags,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(jobConditions);

    const jobIds = jobRows.map((row) => row.id);

    let crewRows: CrewRow[] = [];
    if (canViewAllCrews) {
      crewRows = await db
        .select({
          id: crewMembers.id,
          firstName: crewMembers.firstName,
          lastName: crewMembers.lastName,
          displayName: crewMembers.displayName,
          role: crewMembers.role,
          active: crewMembers.active,
          defaultStartMinutes: crewMembers.defaultStartMinutes,
          defaultEndMinutes: crewMembers.defaultEndMinutes,
        })
        .from(crewMembers)
        .where(eq(crewMembers.orgId, params.orgId));
    } else {
      crewRows =
        scopedCrewIds.length > 0
          ? await db
              .select({
                id: crewMembers.id,
                firstName: crewMembers.firstName,
                lastName: crewMembers.lastName,
                displayName: crewMembers.displayName,
                role: crewMembers.role,
                active: crewMembers.active,
                defaultStartMinutes: crewMembers.defaultStartMinutes,
                defaultEndMinutes: crewMembers.defaultEndMinutes,
              })
              .from(crewMembers)
              .where(and(eq(crewMembers.orgId, params.orgId), inArray(crewMembers.id, scopedCrewIds)))
          : [];
    }

    const taskSummaryRows = jobIds.length
      ? await db
          .select({
            jobId: tasks.jobId,
            total: sql<number>`count(*)`.mapWith(Number),
            completedTotal: sql<number>`sum(case when ${tasks.status} = 'completed' then 1 else 0 end)`.mapWith(Number),
            requiredTotal: sql<number>`sum(case when ${tasks.isRequired} then 1 else 0 end)`.mapWith(Number),
            requiredCompleted: sql<number>`sum(case when ${tasks.isRequired} and ${tasks.status} = 'completed' then 1 else 0 end)`.mapWith(Number),
          })
          .from(tasks)
          .where(and(eq(tasks.orgId, params.orgId), inArray(tasks.jobId, jobIds)))
          .groupBy(tasks.jobId)
      : [];

    const taskSummaryByJobId = new Map<string, TaskSummaryRow>();
    taskSummaryRows.forEach((row) => {
      taskSummaryByJobId.set(String(row.jobId), {
        jobId: String(row.jobId),
        total: Number(row.total ?? 0),
        completedTotal: Number(row.completedTotal ?? 0),
        requiredTotal: Number(row.requiredTotal ?? 0),
        requiredCompleted: Number(row.requiredCompleted ?? 0),
      });
    });

    const usageSummaryRows = jobIds.length
      ? await db
          .select({
            jobId: materialUsageLogs.jobId,
            usageCount: sql<number>`count(*)`.mapWith(Number),
          })
          .from(materialUsageLogs)
          .where(and(eq(materialUsageLogs.orgId, params.orgId), inArray(materialUsageLogs.jobId, jobIds)))
          .groupBy(materialUsageLogs.jobId)
      : [];

    const usageByJobId = new Map<string, UsageSummaryRow>();
    usageSummaryRows.forEach((row) => {
      usageByJobId.set(String(row.jobId), { jobId: String(row.jobId), usageCount: Number(row.usageCount ?? 0) });
    });

    const crewNameById = new Map<string, string>();
    crewRows.forEach((crew) => {
      crewNameById.set(crew.id, formatCrewName(crew));
    });

    const jobLocationById = new Map<string, JobLocation>();
    jobRows.forEach((job) => {
      const address = buildFullAddress(job);
      const shortAddress = getShortAddress(job);
      jobLocationById.set(job.id, {
        lat: parseNumber(job.latitude),
        lng: parseNumber(job.longitude),
        address: address || null,
        shortAddress,
      });
    });

    const jobsPayload: OperationsMapJob[] = jobRows.map((job) => {
      const assignments = assignmentsByJobId.get(job.id) ?? [];
      const activeAssignment =
        assignments.find((assignment) => {
          if (assignment.status === 'cancelled' || assignment.status === 'completed') return false;
          if (assignment.status === 'in_progress') return true;
          return nowMs >= assignment.scheduledStart.getTime() && nowMs <= assignment.scheduledEnd.getTime();
        }) ?? null;
      const nextAssignment =
        assignments.find((assignment) => assignment.scheduledStart.getTime() >= nowMs && assignment.status !== 'cancelled') ??
        null;
      const primaryAssignment = activeAssignment ?? nextAssignment ?? assignments[0] ?? null;

      let scheduledStart: Date | null = primaryAssignment ? primaryAssignment.scheduledStart : null;
      let scheduledEnd: Date | null = primaryAssignment ? primaryAssignment.scheduledEnd : null;

      if (!primaryAssignment && job.scheduledStart && job.scheduledEnd) {
        const start = new Date(job.scheduledStart);
        const end = new Date(job.scheduledEnd);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          scheduledStart = start;
          scheduledEnd = end;
        }
      }

      const assignmentCrewIds = new Set(
        assignments
          .map((assignment) => assignment.crewId)
          .filter((crewId): crewId is string => Boolean(crewId))
      );
      if (assignmentCrewIds.size === 0 && assignments.length === 0 && job.crewId) {
        assignmentCrewIds.add(job.crewId);
      }

      const crewList = Array.from(assignmentCrewIds).map((crewId) => ({
        id: crewId,
        name: crewNameById.get(crewId) ?? `Crew ${crewId.slice(0, 8)}`,
      }));

      const taskSummary = taskSummaryByJobId.get(job.id) ?? null;
      const usageSummary = usageByJobId.get(job.id) ?? null;
      const progressStatus = job.progressStatus ?? 'not_started';
      const hasSchedule = Boolean(scheduledStart && scheduledEnd);
      const scheduleState = hasSchedule
        ? assignmentCrewIds.size > 0
          ? 'scheduled_assigned'
          : 'scheduled_unassigned'
        : null;
      const progressPercent =
        taskSummary && taskSummary.total > 0
          ? Math.round((taskSummary.completedTotal / Math.max(1, taskSummary.total)) * 100)
          : progressPercentFromStatus(progressStatus);

      const hasProgressUpdate = progressStatus !== 'not_started' || (taskSummary?.completedTotal ?? 0) > 0;
      const hasMaterialsLogged = (usageSummary?.usageCount ?? 0) > 0;
      const hasCrewAssigned = assignmentCrewIds.size > 0;
      const scheduleStartMs = scheduledStart ? scheduledStart.getTime() : null;
      const withinRiskWindow =
        scheduleStartMs !== null && Math.abs(scheduleStartMs - nowMs) <= riskWindowMinutes * 60 * 1000;

      const isLate =
        scheduleStartMs !== null &&
        scheduleStartMs < nowMs &&
        !hasProgressUpdate &&
        job.status !== 'completed';
      const noProgressUpdate = scheduleStartMs !== null && scheduleStartMs < nowMs && !hasProgressUpdate;
      const noMaterialsLogged = scheduleStartMs !== null && scheduleStartMs < nowMs && !hasMaterialsLogged;
      const noCrewNearStart = withinRiskWindow && !hasCrewAssigned;

      const flags = normalizeFlags(job.flags);
      const blocked = flags.includes('blocked');

      const reasons: string[] = [];
      if (noProgressUpdate) reasons.push('No progress update');
      if (noMaterialsLogged) reasons.push('No materials logged');
      if (noCrewNearStart) reasons.push('No crew assigned near start');
      if (blocked) reasons.push('Blocked');

      return {
        id: job.id,
        title: job.title,
        status: job.status,
        scheduleState,
        progressStatus,
        progressPercent: Number.isFinite(progressPercent) ? progressPercent : null,
        crew: crewList,
        scheduledStart: scheduledStart ? scheduledStart.toISOString() : null,
        scheduledEnd: scheduledEnd ? scheduledEnd.toISOString() : null,
        address: jobLocationById.get(job.id)?.address ?? '',
        shortAddress: jobLocationById.get(job.id)?.shortAddress ?? 'No site address',
        latitude: jobLocationById.get(job.id)?.lat ?? null,
        longitude: jobLocationById.get(job.id)?.lng ?? null,
        risk: {
          late: isLate,
          blocked,
          idleRisk: noCrewNearStart,
          atRisk: reasons.length > 0,
          reasons,
        },
      };
    });

    const crewsPayload: OperationsMapCrew[] = crewRows.map((crew) => {
      const assignments = assignmentsByCrewId.get(crew.id) ?? [];
      const currentAssignment =
        assignments.find((assignment) => {
          if (assignment.status === 'cancelled' || assignment.status === 'completed') return false;
          if (assignment.status === 'in_progress') return true;
          return nowMs >= assignment.scheduledStart.getTime() && nowMs <= assignment.scheduledEnd.getTime();
        }) ?? null;
      const nextAssignment =
        assignments.find((assignment) => assignment.scheduledStart.getTime() > nowMs && assignment.status !== 'cancelled') ??
        null;
      const lastAssignment =
        [...assignments].reverse().find((assignment) => assignment.scheduledEnd.getTime() <= nowMs) ?? null;

      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const shiftStartMinutes = crew.defaultStartMinutes ?? 6 * 60;
      const shiftEndMinutes = crew.defaultEndMinutes ?? 18 * 60;
      const withinShift = crew.active && nowMinutes >= shiftStartMinutes && nowMinutes <= shiftEndMinutes;

      let state: OperationsMapCrew['state'] = 'off_shift';
      if (!crew.active) {
        state = 'off_shift';
      } else if (currentAssignment) {
        state = 'on_job';
      } else if (nextAssignment && withinShift && nextAssignment.scheduledStart.getTime() - nowMs <= DEFAULT_EN_ROUTE_WINDOW_MINUTES * 60 * 1000) {
        state = 'en_route';
      } else if (withinShift) {
        state = 'idle';
      }

      const shiftStart = new Date(now);
      shiftStart.setHours(Math.floor(shiftStartMinutes / 60), shiftStartMinutes % 60, 0, 0);

      const idleAnchor = lastAssignment?.scheduledEnd ?? shiftStart;
      const idleMinutes =
        state === 'idle' ? Math.max(0, Math.round((nowMs - idleAnchor.getTime()) / (1000 * 60))) : null;
      const idleRisk = idleMinutes !== null && idleMinutes >= idleThresholdMinutes;

      const locationAssignment = currentAssignment ?? lastAssignment ?? null;
      const locationJob = locationAssignment ? jobLocationById.get(locationAssignment.jobId) ?? null : null;
      const locationLat = locationJob?.lat ?? null;
      const locationLng = locationJob?.lng ?? null;
      const locationAddress = locationJob?.address ?? null;
      const locationSource = locationLat !== null && locationLng !== null ? 'last_job' : 'none';

      return {
        id: crew.id,
        name: formatCrewName(crew),
        role: crew.role ?? null,
        active: crew.active,
        state,
        idleMinutes,
        idleRisk,
        location: {
          lat: locationLat,
          lng: locationLng,
          address: locationAddress,
          source: locationSource,
          jobId: locationAssignment?.jobId ?? null,
        },
        currentJobId: currentAssignment?.jobId ?? null,
        nextJobId: nextAssignment?.jobId ?? null,
        nextJobStart: nextAssignment?.scheduledStart ? nextAssignment.scheduledStart.toISOString() : null,
      };
    });

    return ok({
      orgId: params.orgId,
      generatedAt: now.toISOString(),
      jobs: jobsPayload,
      crews: crewsPayload,
      permissions: {
        canManageSchedule: canManageScheduleFlag,
        canManageJobs: canManageJobsFlag,
        canViewAllCrews,
      },
      thresholds: {
        idleMinutes: idleThresholdMinutes,
        riskStartMinutes: riskWindowMinutes,
      },
    });
  } catch (error) {
    console.error('Error loading operations map data:', error);
    return err('INTERNAL_ERROR', 'Failed to load operations map data', error);
  }
}
