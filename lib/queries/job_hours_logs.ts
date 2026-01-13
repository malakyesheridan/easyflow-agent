import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobHoursLogs, type JobHoursLog } from '@/db/schema/job_hours_logs';
import { ok, err, type Result } from '@/lib/result';
import { jobHoursLogsListSchema } from '@/lib/validators/job_hours_logs';

export async function listJobHoursLogs(params: { orgId: string; jobId: string }): Promise<Result<JobHoursLog[]>> {
  try {
    const validated = jobHoursLogsListSchema.parse(params);
    const db = getDb();
    const rows = await db
      .select()
      .from(jobHoursLogs)
      .where(and(eq(jobHoursLogs.orgId, validated.orgId), eq(jobHoursLogs.jobId, validated.jobId)))
      .orderBy(desc(jobHoursLogs.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job hours logs:', error);
    return err('INTERNAL_ERROR', 'Failed to list hours', error);
  }
}

export async function listJobIdsForCrewMember(params: {
  orgId: string;
  crewMemberId: string;
}): Promise<Result<string[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select({ jobId: jobHoursLogs.jobId })
      .from(jobHoursLogs)
      .where(and(eq(jobHoursLogs.orgId, params.orgId), eq(jobHoursLogs.crewMemberId, params.crewMemberId)))
      .groupBy(jobHoursLogs.jobId);
    return ok(rows.map((row) => String(row.jobId)));
  } catch (error) {
    console.error('Error listing crew member job hours:', error);
    return err('INTERNAL_ERROR', 'Failed to list crew member jobs', error);
  }
}
