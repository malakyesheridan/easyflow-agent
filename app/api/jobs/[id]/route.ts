import { withRoute } from '@/lib/api/withRoute';
import { deleteJob } from '@/lib/mutations/jobs';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/jobs/[id]
 * Deletes a job and all associated tasks.
 * 
 * Query parameters:
 * - orgId (required): Organization ID
 */
export async function DELETE(
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

    // Validate jobId
    if (!id) {
      return err('VALIDATION_ERROR', 'Job ID is required');
    }

    const before = await getJobById(id, context.data.orgId);
    if (!before.ok) return before;
    const access = assertJobWriteAccess(before.data, context.data.actor);
    if (!access.ok) return access;
    const result = await deleteJob(id, context.data.orgId);
    if (result.ok) {
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: context.data.actor.userId,
        actorType: 'user',
        action: 'DELETE',
        entityType: 'job',
        entityId: id,
        before: before.ok ? before.data : null,
        after: null,
        metadata: buildAuditMetadata(request),
      });
    }
    return result;
  });

  return handler(req);
}

