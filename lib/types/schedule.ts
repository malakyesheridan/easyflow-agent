import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignment as DBScheduleAssignment } from '@/db/schema/schedule_assignments';

/**
 * PHASE C2: Schedule Assignment as First-Class Entity
 * 
 * ScheduleAssignments are now stored in the database as separate entities.
 * - One Job can have many ScheduleAssignments
 * - Jobs are immutable reference data
 * - ScheduleAssignments are mutable schedule state
 * - Assignments can span multiple crews, days, etc.
 */

/**
 * Frontend representation of a ScheduleAssignment with joined job data.
 * This is what the schedule views render.
 */
export interface ScheduleAssignmentWithJob {
  /**
   * Unique identifier for this assignment (from database).
   */
  id: string;
  
  /**
   * Reference to the job being scheduled.
   * Jobs are immutable reference data - never mutate job fields from schedule.
   */
  jobId: string;
  
  /**
   * Joined job data for display purposes.
   * This is always the latest job data from the database.
   */
  job: Job & { clientDisplayName?: string | null };
  
  /**
   * Crew assigned to work this job.
   * This is schedule state, not job state.
   */
  crewId: string | null;
  
  /**
   * Date of the assignment (normalized to start of day).
   */
  date: Date;
  
  /**
   * Start time in minutes from workday start (06:00 = 0, 18:00 = 720).
   */
  startMinutes: number;
  
  /**
   * End time in minutes from workday start.
   */
  endMinutes: number;
  
  /**
   * Assignment type key (org-configured).
   */
  assignmentType: string;

  /**
   * Whether the crew starts from HQ for this assignment.
   */
  startAtHq: boolean;

  /**
   * Whether the crew returns to HQ after this assignment.
   */
  endAtHq: boolean;
  
  /**
   * Assignment-level status (e.g., 'scheduled', 'in_progress').
   * This may differ from job.status.
   */
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  
  /**
   * Calculated scheduled start time (date + startMinutes).
   */
  scheduledStart: Date;
  
  /**
   * Calculated scheduled end time (date + endMinutes).
   */
  scheduledEnd: Date;
}

/**
 * Convert database ScheduleAssignment + Job to frontend representation.
 */
export function dbAssignmentToFrontend(
  dbAssignment: DBScheduleAssignment,
  job: Job & { clientDisplayName?: string | null }
): ScheduleAssignmentWithJob {
  const date = new Date(dbAssignment.date);
  date.setHours(0, 0, 0, 0);
  
  // Calculate actual start/end times
  const scheduledStart = new Date(date);
  scheduledStart.setHours(6, 0, 0, 0); // Workday starts at 06:00
  scheduledStart.setMinutes(scheduledStart.getMinutes() + dbAssignment.startMinutes);
  
  const scheduledEnd = new Date(date);
  scheduledEnd.setHours(6, 0, 0, 0);
  scheduledEnd.setMinutes(scheduledEnd.getMinutes() + dbAssignment.endMinutes);
  
  return {
    id: dbAssignment.id,
    jobId: dbAssignment.jobId,
    job,
    crewId: dbAssignment.crewId ?? null,
    date,
    startMinutes: dbAssignment.startMinutes,
    endMinutes: dbAssignment.endMinutes,
    assignmentType: dbAssignment.assignmentType,
    startAtHq: dbAssignment.startAtHq ?? false,
    endAtHq: dbAssignment.endAtHq ?? false,
    status: dbAssignment.status,
    scheduledStart,
    scheduledEnd,
  };
}

/**
 * Derive assignment type from job status.
 */
export function getAssignmentTypeFromJob(job: Job): string {
  return job.jobTypeId ?? 'default';
}

/**
 * Legacy helper for backward compatibility during migration.
 * Converts a Job with scheduling fields to a ScheduleAssignmentWithJob.
 * This is used during the transition period.
 */
export function jobToAssignment(job: Job): ScheduleAssignmentWithJob | null {
  // Only create assignment if job has scheduling fields
  if (!job.scheduledStart || !job.scheduledEnd) {
    return null;
  }
  
  const scheduledStart = new Date(job.scheduledStart);
  const scheduledEnd = new Date(job.scheduledEnd);
  const date = new Date(scheduledStart);
  date.setHours(0, 0, 0, 0);
  
  // Calculate minutes from workday start (06:00)
  const workdayStart = new Date(date);
  workdayStart.setHours(6, 0, 0, 0);
  
  const startMinutes = Math.round((scheduledStart.getTime() - workdayStart.getTime()) / (1000 * 60));
  const endMinutes = Math.round((scheduledEnd.getTime() - workdayStart.getTime()) / (1000 * 60));
  
  return {
    id: job.id, // Legacy: use jobId as assignmentId during migration
    jobId: job.id,
    job: { ...job },
    crewId: job.crewId ?? null,
    date,
    startMinutes,
    endMinutes,
    assignmentType: getAssignmentTypeFromJob(job),
    startAtHq: false,
    endAtHq: false,
    status: job.status === 'scheduled' || job.status === 'in_progress' ? job.status : 'scheduled',
    scheduledStart,
    scheduledEnd,
  };
}

/**
 * Extract only scheduling fields from an assignment update.
 * This ensures we never accidentally update job core fields.
 * 
 * @deprecated Use assignment API endpoints instead
 */
export function assignmentToScheduleUpdate(assignment: Partial<ScheduleAssignmentWithJob>): {
  crewId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignmentStatus?: string;
} {
  return {
    crewId: assignment.crewId ?? null,
    scheduledStart: assignment.scheduledStart ? assignment.scheduledStart.toISOString() : null,
    scheduledEnd: assignment.scheduledEnd ? assignment.scheduledEnd.toISOString() : null,
    assignmentStatus: assignment.status,
  };
}
