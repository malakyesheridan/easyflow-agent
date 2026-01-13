import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobHoursLogs, type JobHoursLog, type NewJobHoursLog } from '@/db/schema/job_hours_logs';
import { ok, err, type Result } from '@/lib/result';
import { jobTimeEntryCreateSchema, jobTimeEntryUpdateSchema, type JobTimeEntryCreateInput, type JobTimeEntryUpdateInput } from '@/lib/validators/job_time_entries';
import { getJobTimeEntryById } from '@/lib/queries/job_time_entries';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

function diffMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export async function createJobTimeEntry(
  input: JobTimeEntryCreateInput & { createdByCrewMemberId?: string | null }
): Promise<Result<JobHoursLog>> {
  try {
    const validated = jobTimeEntryCreateSchema.parse(input);
    const db = getDb();

    const startTime = new Date(validated.startTime);
    const endTime = new Date(validated.endTime);
    const minutes = diffMinutes(startTime, endTime);
    if (minutes <= 0) {
      return err('VALIDATION_ERROR', 'Time entry duration must be at least 1 minute');
    }

    const values: NewJobHoursLog = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      crewMemberId: validated.crewMemberId ?? input.createdByCrewMemberId ?? null,
      minutes,
      startTime,
      endTime,
      bucket: validated.bucket,
      delayReason: validated.delayReason ?? null,
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
    console.error('Error creating job time entry:', error);
    return err('INTERNAL_ERROR', 'Failed to create job time entry', error);
  }
}

export async function updateJobTimeEntry(input: JobTimeEntryUpdateInput): Promise<Result<JobHoursLog>> {
  try {
    const validated = jobTimeEntryUpdateSchema.parse(input);
    const db = getDb();

    const existingResult = await getJobTimeEntryById({ orgId: validated.orgId, id: validated.id });
    if (!existingResult.ok) return existingResult;
    if (!existingResult.data) return err('NOT_FOUND', 'Time entry not found');

    const existing = existingResult.data;

    const nextStart = validated.startTime ? new Date(validated.startTime) : existing.startTime;
    const nextEnd = validated.endTime ? new Date(validated.endTime) : existing.endTime;
    const nextBucket = validated.bucket ?? existing.bucket;
    const nextDelayReason = validated.delayReason !== undefined ? validated.delayReason : existing.delayReason;
    const nextNote = validated.note !== undefined ? validated.note : existing.note;

    if (nextBucket === 'WAITING' && !nextDelayReason) {
      return err('VALIDATION_ERROR', 'delayReason is required when bucket=WAITING');
    }
    if (nextDelayReason === 'OTHER_WITH_NOTE' && !nextNote?.trim()) {
      return err('VALIDATION_ERROR', 'note is required when delayReason=OTHER_WITH_NOTE');
    }

    let nextMinutes = existing.minutes;
    if (nextStart && nextEnd) {
      if (nextEnd <= nextStart) {
        return err('VALIDATION_ERROR', 'endTime must be after startTime');
      }
      nextMinutes = diffMinutes(nextStart, nextEnd);
      if (nextMinutes <= 0) {
        return err('VALIDATION_ERROR', 'Time entry duration must be at least 1 minute');
      }
    }

    const [row] = await db
      .update(jobHoursLogs)
      .set({
        jobId: validated.jobId ?? existing.jobId,
        crewMemberId: validated.crewMemberId ?? existing.crewMemberId,
        minutes: nextMinutes,
        startTime: nextStart ?? null,
        endTime: nextEnd ?? null,
        bucket: nextBucket ?? null,
        delayReason: nextDelayReason ?? null,
        note: nextNote ?? null,
      })
      .where(and(eq(jobHoursLogs.orgId, validated.orgId), eq(jobHoursLogs.id, validated.id)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Time entry not found');
    void recomputeCrewInstallStatsForOrg({ orgId: row.orgId });
    void evaluateJobGuardrailsBestEffort({ orgId: row.orgId, jobId: row.jobId });
    return ok(row);
  } catch (error) {
    console.error('Error updating job time entry:', error);
    return err('INTERNAL_ERROR', 'Failed to update job time entry', error);
  }
}
