import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { listJobTimeEntries, getJobTimeEntryById } from '@/lib/queries/job_time_entries';
import { listCrewMembersByIds } from '@/lib/queries/crew_members';
import { createJobTimeEntry, updateJobTimeEntry } from '@/lib/mutations/job_time_entries';
import { assertJobWriteAccess, canViewJobs, canWriteJobArtifacts } from '@/lib/authz';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-time-entries?orgId=...&jobId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(jobId, context.data.orgId, context.data.actor);
  if (!jobResult.ok) return jobResult;
  const entriesResult = await listJobTimeEntries({ orgId: context.data.orgId, jobId });
  if (!entriesResult.ok) return entriesResult;

  const entries = entriesResult.data;
  const crewIds = Array.from(new Set(entries.map((entry) => entry.crewMemberId).filter(Boolean))) as string[];
  const crewById = new Map<string, string>();

  if (crewIds.length > 0) {
    const crewResult = await listCrewMembersByIds({ orgId: context.data.orgId, ids: crewIds });
    if (crewResult.ok) {
      for (const crew of crewResult.data) {
        crewById.set(crew.id, crew.displayName);
      }
    }
  }

  return ok(
    entries.map((entry) => ({
      ...entry,
      crewMemberName: entry.crewMemberId ? crewById.get(entry.crewMemberId) ?? null : null,
    }))
  );
});

/**
 * POST /api/job-time-entries
 * Body: { orgId, jobId, bucket, startTime, endTime, delayReason?, note?, crewMemberId? }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(String(body.jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  return await createJobTimeEntry({ ...body, orgId: context.data.orgId, createdByCrewMemberId: actor.crewMemberId });
});

/**
 * PATCH /api/job-time-entries
 * Body: { id, orgId, bucket?, startTime?, endTime?, delayReason?, note?, crewMemberId? }
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const actor = context.data.actor;
  if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const existingResult = await getJobTimeEntryById({ orgId: context.data.orgId, id: String(body.id) });
  if (!existingResult.ok) return existingResult;
  if (!existingResult.data) return err('NOT_FOUND', 'Time entry not found');

  const jobResult = await getJobById(String(existingResult.data.jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  return await updateJobTimeEntry({ ...body, orgId: context.data.orgId });
});
