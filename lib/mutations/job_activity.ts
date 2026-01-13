import { getDb } from '@/lib/db';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { ok, err, type Result } from '@/lib/result';
import type { JobActivityEvent, NewJobActivityEvent } from '@/db/schema/job_activity_events';
import { jobActivityCreateSchema, type CreateJobActivityInput } from '@/lib/validators/job_activity';

export async function createJobActivityEvent(
  input: CreateJobActivityInput
): Promise<Result<JobActivityEvent>> {
  try {
    const validated = jobActivityCreateSchema.parse(input);
    const db = getDb();

    const values: NewJobActivityEvent = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      type: validated.type,
      actorCrewMemberId: validated.actorCrewMemberId ?? null,
      payload: (validated.payload ?? null) as any,
    };

    const [row] = await db.insert(jobActivityEvents).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating job activity event:', error);
    return err('INTERNAL_ERROR', 'Failed to create activity event', error);
  }
}

export async function createJobActivityEventBestEffort(input: CreateJobActivityInput): Promise<void> {
  try {
    await createJobActivityEvent(input);
  } catch {
    // Swallow errors: activity logging must never break primary flows (schedule, tasks, uploads).
  }
}

