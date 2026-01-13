import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listInstallModifiersForJob } from '@/lib/queries/install_modifiers';
import { setJobInstallModifiers } from '@/lib/mutations/job_install_modifiers';
import { seedDefaultInstallModifiers } from '@/lib/mutations/install_modifiers';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs, canViewJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/job-install-modifiers?orgId=...&jobId=...
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
  const listResult = await listInstallModifiersForJob({ orgId: context.data.orgId, jobId });
  if (listResult.ok && listResult.data.length === 0) {
    await seedDefaultInstallModifiers(context.data.orgId);
    return await listInstallModifiersForJob({ orgId: context.data.orgId, jobId });
  }
  return listResult;
});

/**
 * PATCH /api/job-install-modifiers
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobResult = await getJobById(String(body.jobId), context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, context.data.actor);
  if (!access.ok) return access;
  return await setJobInstallModifiers({ ...body, orgId: context.data.orgId });
});
