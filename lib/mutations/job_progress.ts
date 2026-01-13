import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { jobProgressStatusSchema, type JobProgressStatus } from '@/lib/validators/jobs';
import type { Job } from '@/db/schema/jobs';
import { emitCommEvent } from '@/lib/communications/emit';
import { emitAppEvent } from '@/lib/integrations/events/emit';

function formatProgressPercent(status: JobProgressStatus): string {
  if (status === 'not_started') return '0%';
  if (status === 'half_complete') return '50%';
  if (status === 'completed') return '100%';
  return 'In progress';
}

function progressPercent(status: JobProgressStatus): number {
  if (status === 'not_started') return 0;
  if (status === 'half_complete') return 50;
  if (status === 'completed') return 100;
  return 25;
}

function hashToUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function formatJobLabel(job: Job): string {
  const parts = [job.addressLine1, job.suburb].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : job.title;
}

export async function updateJobProgressStatus(input: {
  jobId: string;
  orgId: string;
  progressStatus: JobProgressStatus;
}): Promise<Result<Job>> {
  try {
    const validatedStatus = jobProgressStatusSchema.parse(input.progressStatus);
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), eq(jobs.orgId, input.orgId)))
        .limit(1);

      if (!existing) {
        return err('NOT_FOUND', 'Job not found');
      }

      const fromStatus = (existing.progressStatus as JobProgressStatus | undefined) ?? 'not_started';
      if (fromStatus === validatedStatus) {
        return ok({ job: existing, changed: false, fromStatus, toStatus: validatedStatus });
      }

      const [updated] = await tx
        .update(jobs)
        .set({
          progressStatus: validatedStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, input.jobId), eq(jobs.orgId, input.orgId)))
        .returning();

      if (!updated) {
        return err('INTERNAL_ERROR', 'Failed to update job progress');
      }

      return ok({ job: updated, changed: true, fromStatus, toStatus: validatedStatus });
    });

    if (!result.ok) return result;

    const { job, changed, fromStatus, toStatus } = result.data;
    if (changed) {
      const message = `Job at ${formatJobLabel(job)} is now ${formatProgressPercent(toStatus)} complete.`;
      const entityId = hashToUuid(`${job.id}:${fromStatus}->${toStatus}`);
      void emitCommEvent({
        orgId: job.orgId,
        eventKey: 'job_progress_updated',
        entityType: 'job_progress',
        entityId,
        triggeredByUserId: null,
        payload: {
          jobId: job.id,
          progress: {
            fromStatus,
            toStatus,
            message,
          },
        },
      });
      void emitAppEvent({
        orgId: job.orgId,
        eventType: 'job.progress.updated',
        payload: {
          jobId: job.id,
          status: job.status,
          crewId: job.crewId ?? null,
          jobTypeId: job.jobTypeId ?? null,
          progressStatus: toStatus,
          progressPercent: progressPercent(toStatus),
        },
        actorUserId: null,
      });
    }

    return ok(job);
  } catch (error) {
    console.error('Error updating job progress status:', error);
    return err('INTERNAL_ERROR', 'Failed to update job progress status', error);
  }
}
