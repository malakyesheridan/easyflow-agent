import { db, getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { eq, and, gte, lte, asc, desc, isNull, inArray } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';
import type { Result } from '@/lib/result';
import type { Job } from '@/db/schema/jobs';
import type { JobStatus } from '@/lib/validators/jobs';

/**
 * Retrieves a single job by ID and organization ID.
 * 
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result containing the job or an error
 */
export async function getJobById(
  jobId: string,
  orgId: string,
  actor?: RequestActor
): Promise<Result<Job>> {
  try {
    const baseWhere = and(eq(jobs.id, jobId), eq(jobs.orgId, orgId));
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const job = await db.query.jobs.findFirst({
      where,
    });

    if (!job) {
      return err('NOT_FOUND', 'Job not found');
    }

    return ok(job);
  } catch (error) {
    console.error('Error fetching job by ID:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job', error);
  }
}

/**
 * Lists jobs by status for an organization.
 * 
 * @param orgId - The organization ID (UUID)
 * @param status - The job status to filter by
 * @returns Result containing array of jobs or an error
 */
export async function listJobsByStatus(
  orgId: string,
  status: JobStatus,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    const baseWhere = and(eq(jobs.orgId, orgId), eq(jobs.status, status));
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await db.query.jobs.findMany({
      where,
      orderBy: [
        asc(jobs.scheduledStart),
        desc(jobs.createdAt),
      ],
    });

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing jobs by status:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

/**
 * Lists jobs within a date range based on scheduled_start.
 * Returns jobs where scheduled_start overlaps the provided range.
 * 
 * @param orgId - The organization ID (UUID)
 * @param start - Start date of the range
 * @param end - End date of the range
 * @returns Result containing array of jobs or an error
 */
export async function listJobsForDateRange(
  orgId: string,
  start: Date,
  end: Date,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    const baseWhere = and(
      eq(jobs.orgId, orgId),
      // Jobs where scheduled_start is within the range
      gte(jobs.scheduledStart, start),
      lte(jobs.scheduledStart, end)
    );
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(asc(jobs.scheduledStart));

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing jobs for date range:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

/**
 * Lists unassigned jobs for an organization.
 * PART 3: Canonical rule - unassigned means crewId IS NULL only
 * 
 * @param orgId - The organization ID (UUID)
 * @returns Result containing array of unassigned jobs or an error
 */
export async function listUnassignedJobs(
  orgId: string,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    const baseWhere = and(eq(jobs.orgId, orgId), isNull(jobs.crewId));
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await db.query.jobs.findMany({
      where,
      orderBy: [asc(jobs.createdAt)],
    });

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing unassigned jobs:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

/**
 * Lists jobs by crewId filter for an organization.
 * Used to fetch unassigned jobs (crewId IS NULL).
 * 
 * @param orgId - The organization ID (UUID)
 * @param crewId - The crew ID to filter by, or null for unassigned
 * @returns Result containing array of jobs or an error
 */
export async function listJobsByCrewId(
  orgId: string,
  crewId: string | null,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    const baseWhere = and(
      eq(jobs.orgId, orgId),
      crewId === null ? isNull(jobs.crewId) : eq(jobs.crewId, crewId)
    );
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await db.query.jobs.findMany({
      where,
      orderBy: [asc(jobs.createdAt)],
    });

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing jobs by crewId:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

/**
 * Lists ALL jobs for an organization with NO filtering.
 * This is the canonical query for the Schedule page.
 * Returns all jobs regardless of status, crewId, or scheduledStart.
 * Frontend handles presentation logic.
 * 
 * @param orgId - The organization ID (UUID)
 * @returns Result containing array of all jobs or an error
 */
export async function listAllJobsForOrg(
  orgId: string,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    // Use getDb() directly to ensure proper initialization
    const dbInstance = getDb();
    const baseWhere = eq(jobs.orgId, orgId);
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await dbInstance.query.jobs.findMany({
      where,
      orderBy: [asc(jobs.createdAt)],
    });

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing all jobs for org:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

/**
 * Gets multiple jobs by their IDs for an organization.
 * Used for joining job data with schedule assignments.
 * 
 * @param jobIds - Array of job IDs (UUIDs)
 * @param orgId - The organization ID (UUID)
 * @returns Result containing array of jobs or an error
 */
export async function getJobsByIds(
  jobIds: string[],
  orgId: string,
  actor?: RequestActor
): Promise<Result<Job[]>> {
  try {
    if (jobIds.length === 0) {
      return ok([]);
    }
    
    const baseWhere = and(eq(jobs.orgId, orgId), inArray(jobs.id, jobIds));
    const where = actor ? applyJobVisibility(baseWhere, actor) : baseWhere;
    const jobsList = await db
      .select()
      .from(jobs)
      .where(where);
    
    return ok(jobsList);
  } catch (error) {
    console.error('Error fetching jobs by IDs:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch jobs', error);
  }
}

