import { withRoute } from '@/lib/api/withRoute';
import { duplicateJobWithTasks } from '@/lib/mutations/jobs';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/jobs/[id]/duplicate
 * Duplicates a job with all its tasks in a single transaction.
 * 
 * Query parameters:
 * - orgId (required): Organization ID
 */
export async function POST(
  req: Request,
  { params }: RouteParams
): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const jobResult = await getJobById(id, context.data.orgId);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) return access;

    return await duplicateJobWithTasks(id, context.data.orgId);
  });

  return handler(req);
}

