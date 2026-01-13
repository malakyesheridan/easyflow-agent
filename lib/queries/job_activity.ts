import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { crewMembers } from '@/db/schema/crew_members';
import { ok, err, type Result } from '@/lib/result';

export type JobActivityEventWithActor = {
  id: string;
  orgId: string;
  jobId: string;
  type: string;
  actorCrewMemberId: string | null;
  actorDisplayName: string | null;
  payload: any;
  createdAt: Date;
};

export async function listJobActivity(params: {
  orgId: string;
  jobId: string;
  limit?: number;
}): Promise<Result<JobActivityEventWithActor[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: jobActivityEvents.id,
        orgId: jobActivityEvents.orgId,
        jobId: jobActivityEvents.jobId,
        type: jobActivityEvents.type,
        actorCrewMemberId: jobActivityEvents.actorCrewMemberId,
        actorDisplayName: crewMembers.displayName,
        payload: jobActivityEvents.payload,
        createdAt: jobActivityEvents.createdAt,
      })
      .from(jobActivityEvents)
      .leftJoin(
        crewMembers,
        and(
          eq(crewMembers.id, jobActivityEvents.actorCrewMemberId),
          eq(crewMembers.orgId, jobActivityEvents.orgId)
        )
      )
      .where(and(eq(jobActivityEvents.orgId, params.orgId), eq(jobActivityEvents.jobId, params.jobId)))
      .orderBy(desc(jobActivityEvents.createdAt))
      .limit(params.limit ?? 100);

    return ok(rows as unknown as JobActivityEventWithActor[]);
  } catch (error) {
    console.error('Error listing job activity:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch activity log', error);
  }
}
