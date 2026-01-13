import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobReports, type JobReport } from '@/db/schema/job_reports';
import { ok, err, type Result } from '@/lib/result';
import { jobReportsListSchema } from '@/lib/validators/job_reports';

export async function listJobReports(params: { orgId: string; jobId: string }): Promise<Result<JobReport[]>> {
  try {
    const validated = jobReportsListSchema.parse(params);
    const db = getDb();
    const rows = await db
      .select()
      .from(jobReports)
      .where(and(eq(jobReports.orgId, validated.orgId), eq(jobReports.jobId, validated.jobId)))
      .orderBy(desc(jobReports.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job reports:', error);
    return err('INTERNAL_ERROR', 'Failed to list reports', error);
  }
}

