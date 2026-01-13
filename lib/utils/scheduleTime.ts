/**
 * F1: Schedule Time Authority Utilities
 * 
 * RULE: ScheduleAssignment is the single source of truth for time.
 * When a job has >= 1 assignment, job.scheduledStart/scheduledEnd are ignored.
 */

import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';

const DEFAULT_JOB_DURATION_MINUTES = 120;

/**
 * Resolve duration in minutes from assignment or job.
 * Single source of truth for duration calculation.
 * 
 * Priority:
 * 1. Assignment endMinutes - startMinutes (if assignment exists)
 * 2. Job scheduledEnd - scheduledStart (if both exist)
 * 3. DEFAULT_JOB_DURATION_MINUTES (120)
 */
export function resolveDurationMinutes(
  job: Job | null,
  assignment?: { startMinutes: number; endMinutes: number } | null,
  fallbackMinutes: number = DEFAULT_JOB_DURATION_MINUTES
): number {
  // Priority 1: Use assignment duration if available
  if (assignment) {
    const duration = assignment.endMinutes - assignment.startMinutes;
    if (duration > 0) return duration;
  }

  // Priority 2: Use job's scheduled times if available
  if (job?.scheduledStart && job?.scheduledEnd) {
    const start = new Date(job.scheduledStart);
    const end = new Date(job.scheduledEnd);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      if (duration > 0) return duration;
    }
  }

  // Priority 3: Default
  return fallbackMinutes;
}

/**
 * Get effective schedule for a job.
 * If job has assignments, use assignment times (ignore job.scheduledStart/End).
 * Otherwise, fall back to job scheduled times.
 */
export interface EffectiveSchedule {
  startMinutes: number;
  endMinutes: number;
  crewId: string | null;
  date: Date;
  assignmentId?: string;
}

export function getEffectiveSchedule(
  job: Job,
  assignments: ScheduleAssignmentWithJob[]
): EffectiveSchedule[] {
  // Filter assignments for this job
  const jobAssignments = assignments.filter(a => a.jobId === job.id);

  if (jobAssignments.length > 0) {
    // Use assignment times - ignore job.scheduledStart/End
    return jobAssignments.map(a => ({
      startMinutes: a.startMinutes,
      endMinutes: a.endMinutes,
      crewId: a.crewId ?? null,
      date: new Date(a.date),
      assignmentId: a.id,
    }));
  }

  // No assignments - fall back to job scheduled times
  if (job.scheduledStart && job.scheduledEnd) {
    const start = new Date(job.scheduledStart);
    const end = new Date(job.scheduledEnd);
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const date = new Date(start);
      date.setHours(0, 0, 0, 0);
      
      const workdayStart = new Date(date);
      workdayStart.setHours(6, 0, 0, 0);
      
      const startMinutes = Math.round((start.getTime() - workdayStart.getTime()) / (1000 * 60));
      const endMinutes = Math.round((end.getTime() - workdayStart.getTime()) / (1000 * 60));
      
      return [{
        startMinutes,
        endMinutes,
        crewId: job.crewId ?? null,
        date,
      }];
    }
  }

  return [];
}

/**
 * Convert assignment startMinutes/endMinutes to full Date objects.
 * Used for display purposes only.
 */
export function assignmentToDateRange(
  date: Date,
  startMinutes: number,
  endMinutes: number
): { scheduledStart: Date; scheduledEnd: Date } {
  const baseDate = new Date(date);
  baseDate.setHours(6, 0, 0, 0); // Workday starts at 06:00

  const scheduledStart = new Date(baseDate);
  scheduledStart.setMinutes(scheduledStart.getMinutes() + startMinutes);

  const scheduledEnd = new Date(baseDate);
  scheduledEnd.setMinutes(scheduledEnd.getMinutes() + endMinutes);

  return { scheduledStart, scheduledEnd };
}

/**
 * Get display schedule for a job.
 * 
 * RULE: ScheduleAssignments are the ONLY authoritative source.
 * Job.scheduledStart/scheduledEnd are LEGACY and ignored when assignments exist.
 * 
 * Returns null if job has no schedule.
 */
export interface DisplaySchedule {
  start: Date;
  end: Date;
  crewId: string | null;
  date?: Date;
  assignmentId?: string;
}

export function getDisplaySchedule(
  job: Job,
  assignments: ScheduleAssignmentWithJob[]
): DisplaySchedule[] | null {
  // Filter assignments for this job
  const jobAssignments = assignments.filter(a => a.jobId === job.id);

  if (jobAssignments.length > 0) {
    // Use assignment times - IGNORE job.scheduledStart/End completely
    // Ensure dates are always Date objects (may be strings from JSON)
    return jobAssignments.map(a => ({
      start: a.scheduledStart instanceof Date ? a.scheduledStart : new Date(a.scheduledStart),
      end: a.scheduledEnd instanceof Date ? a.scheduledEnd : new Date(a.scheduledEnd),
      crewId: a.crewId ?? null,
      date: a.date instanceof Date ? a.date : new Date(a.date),
      assignmentId: a.id,
    }));
  }

  // No assignments - fall back to legacy job scheduled times
  if (job.scheduledStart && job.scheduledEnd) {
    const start = new Date(job.scheduledStart);
    const end = new Date(job.scheduledEnd);
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return [{
        start,
        end,
        crewId: job.crewId ?? null,
      }];
    }
  }

  return null;
}

