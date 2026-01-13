import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getJobContactById, listJobContacts } from '@/lib/queries/job_contacts';
import { createJobContact, deleteJobContact, updateJobContact } from '@/lib/mutations/job_contacts';
import { assertJobWriteAccess, canManageContacts, canViewJobs } from '@/lib/authz';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-contacts?orgId=...&jobId=...
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
  return await listJobContacts({ orgId: context.data.orgId, jobId });
});

/**
 * POST /api/job-contacts
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const jobId = body?.jobId;
  if (!jobId) return err('VALIDATION_ERROR', 'jobId is required');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageContacts(actor)) return err('FORBIDDEN', 'Insufficient permissions to manage contacts');

  const jobResult = await getJobById(String(jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await createJobContact({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId,
      type: 'contact_created',
      actorCrewMemberId: actor.crewMemberId,
      payload: { contactId: result.data.id, name: result.data.name },
    });
  }
  return result;
});

/**
 * PATCH /api/job-contacts
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const id = body?.id;
  if (!id) return err('VALIDATION_ERROR', 'id is required');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageContacts(actor)) return err('FORBIDDEN', 'Insufficient permissions to manage contacts');

  const existing = await getJobContactById({ orgId: context.data.orgId, id: String(id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const result = await updateJobContact({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId: result.data.jobId,
      type: 'contact_updated',
      actorCrewMemberId: actor.crewMemberId,
      payload: { contactId: result.data.id },
    });
  }
  return result;
});

/**
 * DELETE /api/job-contacts?id=...&orgId=...&jobId=...
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!id || !jobId) return err('VALIDATION_ERROR', 'id and jobId query parameters are required');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageContacts(actor)) return err('FORBIDDEN', 'Insufficient permissions to manage contacts');

  const existing = await getJobContactById({ orgId: context.data.orgId, id: String(id) });
  if (!existing.ok) return existing;
  const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, actor);
  if (!access.ok) return access;

  const resolvedJobId = existing.data.jobId;
  const result = await deleteJobContact({ id, orgId: context.data.orgId });
  if (result.ok) {
    void createJobActivityEventBestEffort({
      orgId: context.data.orgId,
      jobId: resolvedJobId,
      type: 'contact_deleted',
      actorCrewMemberId: actor.crewMemberId,
      payload: { contactId: id },
    });
  }
  return result;
});
