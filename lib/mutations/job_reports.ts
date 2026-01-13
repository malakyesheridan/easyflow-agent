import { getDb } from '@/lib/db';
import { jobReports, type JobReport, type NewJobReport } from '@/db/schema/job_reports';
import { ok, err, type Result } from '@/lib/result';
import { jobReportCreateSchema, type CreateJobReportInput } from '@/lib/validators/job_reports';

export async function createJobReport(
  input: CreateJobReportInput & { createdByCrewMemberId?: string | null }
): Promise<Result<JobReport>> {
  try {
    const validated = jobReportCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobReport = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      note: validated.note.trim(),
      createdByCrewMemberId: input.createdByCrewMemberId ?? null,
      createdAt: new Date(),
    } as any;

    const [row] = await db.insert(jobReports).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job report:', error);
    return err('INTERNAL_ERROR', 'Failed to add report note', error);
  }
}

