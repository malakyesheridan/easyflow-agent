import { getDb } from '@/lib/db';
import { jobHoursLogs, type JobHoursLog, type NewJobHoursLog } from '@/db/schema/job_hours_logs';
import { ok, err, type Result } from '@/lib/result';
import { jobHoursLogCreateSchema, type CreateJobHoursLogInput } from '@/lib/validators/job_hours_logs';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

export async function createJobHoursLog(
  input: CreateJobHoursLogInput & { createdByCrewMemberId?: string | null }
): Promise<Result<JobHoursLog>> {
  try {
    const validated = jobHoursLogCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobHoursLog = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      crewMemberId: validated.crewMemberId ?? input.createdByCrewMemberId ?? null,
      minutes: validated.minutes,
      note: validated.note ?? null,
      createdAt: new Date(),
    } as any;

    const [row] = await db.insert(jobHoursLogs).values(values).returning();
    if (row) {
      void recomputeCrewInstallStatsForOrg({ orgId: row.orgId });
      void evaluateJobGuardrailsBestEffort({ orgId: row.orgId, jobId: row.jobId });
    }
    return ok(row);
  } catch (error) {
    console.error('Error creating job hours log:', error);
    return err('INTERNAL_ERROR', 'Failed to log hours', error);
  }
}
