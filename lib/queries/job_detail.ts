import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs, type Job } from '@/db/schema/jobs';
import { orgClients } from '@/db/schema/org_clients';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';
import { err, ok, type Result } from '@/lib/result';

export type CrewJobDetail = Pick<
  Job,
  | 'id'
  | 'orgId'
  | 'title'
  | 'jobTypeId'
  | 'clientId'
  | 'status'
  | 'progressStatus'
  | 'crewId'
  | 'addressLine1'
  | 'addressLine2'
  | 'suburb'
  | 'state'
  | 'postcode'
  | 'country'
  | 'scheduledStart'
  | 'scheduledEnd'
  | 'notes'
>;

export type CrewJobDetailLinks = {
  mapsUrl: string | null;
  jobUrl: string;
};

export type CrewJobDetailPayload = {
  job: CrewJobDetail;
  links: CrewJobDetailLinks;
  client: JobClientSummary | null;
};

export const CREW_JOB_DETAIL_FIELDS = [
  'id',
  'orgId',
  'title',
  'jobTypeId',
  'clientId',
  'status',
  'progressStatus',
  'crewId',
  'addressLine1',
  'addressLine2',
  'suburb',
  'state',
  'postcode',
  'country',
  'scheduledStart',
  'scheduledEnd',
  'notes',
] as const;

export type JobClientSummary = {
  id: string;
  displayName: string;
};

export type AdminJobDetailPayload = {
  job: Job;
  client: JobClientSummary | null;
};

async function getClientSummary(orgId: string, clientId: string | null): Promise<JobClientSummary | null> {
  if (!clientId) return null;
  const [row] = await db
    .select({ id: orgClients.id, displayName: orgClients.displayName })
    .from(orgClients)
    .where(and(eq(orgClients.id, clientId), eq(orgClients.orgId, orgId)))
    .limit(1);
  return row ? { id: row.id, displayName: row.displayName } : null;
}

function buildMapsUrl(job: CrewJobDetail): string | null {
  const address = [
    job.addressLine1,
    job.addressLine2,
    job.suburb,
    job.state,
    job.postcode,
    job.country,
  ]
    .filter(Boolean)
    .join(', ')
    .trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export async function getJobDetailForAdmin(
  jobId: string,
  orgId: string,
  actor: RequestActor
): Promise<Result<AdminJobDetailPayload>> {
  try {
    const baseWhere = and(eq(jobs.id, jobId), eq(jobs.orgId, orgId));
    const where = applyJobVisibility(baseWhere, actor);
    const job = await db.query.jobs.findFirst({ where });

    if (!job) {
      return err('NOT_FOUND', 'Job not found');
    }

    const client = await getClientSummary(orgId, job.clientId ?? null);

    return ok({ job, client });
  } catch (error) {
    console.error('Error fetching admin job detail:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job', error);
  }
}

export async function getJobDetailForCrew(
  jobId: string,
  orgId: string,
  actor: RequestActor
): Promise<Result<CrewJobDetailPayload>> {
  try {
    const baseWhere = and(eq(jobs.id, jobId), eq(jobs.orgId, orgId));
    const where = applyJobVisibility(baseWhere, actor);
    const [job] = await db
      .select({
        id: jobs.id,
        orgId: jobs.orgId,
        title: jobs.title,
        jobTypeId: jobs.jobTypeId,
        clientId: jobs.clientId,
        status: jobs.status,
        progressStatus: jobs.progressStatus,
        crewId: jobs.crewId,
        addressLine1: jobs.addressLine1,
        addressLine2: jobs.addressLine2,
        suburb: jobs.suburb,
        state: jobs.state,
        postcode: jobs.postcode,
        country: jobs.country,
        scheduledStart: jobs.scheduledStart,
        scheduledEnd: jobs.scheduledEnd,
        notes: jobs.notes,
      })
      .from(jobs)
      .where(where)
      .limit(1);

    if (!job) {
      return err('NOT_FOUND', 'Job not found');
    }

    const client = await getClientSummary(orgId, job.clientId ?? null);

    return ok({
      job,
      links: {
        mapsUrl: buildMapsUrl(job),
        jobUrl: `/jobs/${job.id}`,
      },
      client,
    });
  } catch (error) {
    console.error('Error fetching crew job detail:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job', error);
  }
}
