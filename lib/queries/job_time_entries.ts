import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobHoursLogs, type JobHoursLog } from '@/db/schema/job_hours_logs';
import { ok, err, type Result } from '@/lib/result';
import { jobTimeEntriesListSchema } from '@/lib/validators/job_time_entries';

export async function listJobTimeEntries(params: { orgId: string; jobId: string }): Promise<Result<JobHoursLog[]>> {
  try {
    const validated = jobTimeEntriesListSchema.parse(params);
    const db = getDb();
    const rows = await db
      .select()
      .from(jobHoursLogs)
      .where(and(eq(jobHoursLogs.orgId, validated.orgId), eq(jobHoursLogs.jobId, validated.jobId)))
      .orderBy(desc(jobHoursLogs.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job time entries:', error);
    return err('INTERNAL_ERROR', 'Failed to list job time entries', error);
  }
}

export async function getJobTimeEntryById(params: { orgId: string; id: string }): Promise<Result<JobHoursLog | null>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobHoursLogs)
      .where(and(eq(jobHoursLogs.orgId, params.orgId), eq(jobHoursLogs.id, params.id)))
      .limit(1);
    return ok(row ?? null);
  } catch (error) {
    console.error('Error fetching job time entry:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job time entry', error);
  }
}

export async function listJobTimeEntriesForRange(params: {
  orgId: string;
  start: Date;
  end: Date;
  jobIds?: string[];
}): Promise<Result<JobHoursLog[]>> {
  try {
    const db = getDb();
    const filters = [eq(jobHoursLogs.orgId, params.orgId)];
    if (params.jobIds && params.jobIds.length > 0) {
      filters.push(inArray(jobHoursLogs.jobId, params.jobIds));
    }

    const rangeFilter = or(
      and(
        isNotNull(jobHoursLogs.startTime),
        isNotNull(jobHoursLogs.endTime),
        lte(jobHoursLogs.startTime, params.end),
        gte(jobHoursLogs.endTime, params.start)
      ),
      and(isNotNull(jobHoursLogs.startTime), isNull(jobHoursLogs.endTime), gte(jobHoursLogs.startTime, params.start), lte(jobHoursLogs.startTime, params.end)),
      and(isNull(jobHoursLogs.startTime), gte(jobHoursLogs.createdAt, params.start), lte(jobHoursLogs.createdAt, params.end))
    );

    const rows = await db
      .select()
      .from(jobHoursLogs)
      .where(and(...filters, rangeFilter))
      .orderBy(desc(jobHoursLogs.createdAt));

    return ok(rows);
  } catch (error) {
    console.error('Error listing job time entries for range:', error);
    return err('INTERNAL_ERROR', 'Failed to list job time entries', error);
  }
}
