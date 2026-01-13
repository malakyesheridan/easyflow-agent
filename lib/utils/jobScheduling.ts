import type { Job } from '@/db/schema/jobs';

/**
 * RULE: A job is schedulable if and only if:
 * - job.status !== 'completed' (not completed)
 * 
 * Crew assignment must NEVER block scheduling.
 * No date checks, no crewId checks, no inferred logic, no exceptions.
 * This is the single source of truth for scheduling decisions.
 */
export function isSchedulableJob(job: Job): boolean {
  return job.status !== 'completed';
}

/**
 * PHASE B: Unscheduled Work Utility
 * 
 * Determines if a job is "unscheduled" for display in the Unscheduled Work panel.
 * 
 * A job is unscheduled if:
 * 1. Status is 'unassigned' (work that needs scheduling)
 * 2. AND it has no active scheduled assignment for the current day
 * 
 * Key principle: This checks for TODAY's schedule only. A job scheduled tomorrow
 * is still "unscheduled" for today's schedule view.
 * 
 * @param job - The job to check
 * @param currentDate - The date to check against (defaults to today)
 * @returns true if the job should appear in Unscheduled Work panel
 */
export function isUnscheduledJob(job: Job, currentDate: Date = new Date()): boolean {
  // Completed jobs never appear
  if (job.status === 'completed') {
    return false;
  }

  // Only show unassigned jobs
  if (job.status !== 'unassigned') {
    return false;
  }

  // Check if job has an active scheduled assignment for the current day
  if (job.scheduledStart && job.scheduledEnd) {
    const scheduledDate = new Date(job.scheduledStart);
    
    // Check if scheduled date matches current date (same day)
    const isSameDay = 
      scheduledDate.getDate() === currentDate.getDate() &&
      scheduledDate.getMonth() === currentDate.getMonth() &&
      scheduledDate.getFullYear() === currentDate.getFullYear();
    
    // If scheduled for today, it's not unscheduled
    if (isSameDay) {
      return false;
    }
  }

  // Job has no schedule for today, or no schedule at all
  return true;
}

/**
 * Check if a job is already scheduled elsewhere (different day or different time)
 * Used to show warnings when scheduling a job that already has a schedule.
 * 
 * @param job - The job to check
 * @param targetDate - The date we're trying to schedule for
 * @returns true if job has an existing schedule (anywhere)
 */
export function hasExistingSchedule(job: Job): boolean {
  return job.scheduledStart !== null && job.scheduledEnd !== null;
}

