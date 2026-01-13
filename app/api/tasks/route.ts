import { withRoute } from '@/lib/api/withRoute';
import {
  listTasksForJob,
  listTasksByStatus,
  getTaskById,
} from '@/lib/queries/tasks';
import {
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} from '@/lib/mutations/tasks';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { assertJobWriteAccess, canWriteJobArtifacts, canViewJobs } from '@/lib/authz';
import { err } from '@/lib/result';
import type { TaskStatus } from '@/lib/validators/tasks';
import { requireOrgContext } from '@/lib/auth/require';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getJobById } from '@/lib/queries/jobs';

/**
 * GET /api/tasks
 * Retrieves tasks based on query parameters.
 * 
 * Query parameters:
 * - orgId (required): Organization ID
 * - jobId (optional): Filter tasks for a specific job
 * - status (optional): Filter tasks by status
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  const status = searchParams.get('status');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  // Route to appropriate query based on parameters
  if (jobId) {
    // List tasks for a specific job
    return await listTasksForJob(jobId, context.data.orgId, context.data.actor);
  } else if (status) {
    // List tasks by status
    return await listTasksByStatus(context.data.orgId, status as TaskStatus, context.data.actor);
  } else {
    // Invalid query parameters
    return err(
      'VALIDATION_ERROR',
      'Invalid query parameters. Provide either jobId or status'
    );
  }
});

/**
 * POST /api/tasks
 * Creates a new task.
 * 
 * Body: CreateTaskInput (JSON)
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canWriteJobArtifacts(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const jobId = body?.jobId ? String(body.jobId) : null;
  if (!jobId) return err('VALIDATION_ERROR', 'jobId is required');
  const jobResult = await getJobById(jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, context.data.actor);
  if (!access.ok) return access;
  const result = await createTask({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'task',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
    });
  }
  return result;
});

/**
 * PATCH /api/tasks
 * Updates an existing task.
 * 
 * Body: UpdateTaskInput (JSON)
 * 
 * Special case: If body contains id, orgId, and status='completed',
 * calls completeTask for optimized completion.
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();

  // Check if this is a completion request
  const isCompletionRequest =
    body.id &&
    body.orgId &&
    body.status === 'completed' &&
    Object.keys(body).length <= 4; // id, orgId, status, and optionally completedBy

  if (isCompletionRequest) {
    const context = await requireOrgContext(req, String(body.orgId));
    if (!context.ok) return context;
    const actor = context.data.actor;
    if (!canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
    const completedBy = body.completedBy ?? actor.crewMemberId ?? undefined;
    const before = await getTaskById(body.id, context.data.orgId);
    if (!before.ok) return before;
    const jobResult = await getJobById(before.data.jobId, context.data.orgId);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, actor);
    if (!access.ok) return access;
    // Use optimized completion function
    const result = await completeTask(body.id, context.data.orgId, completedBy);
    if (result.ok) {
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: actor.userId,
        actorType: 'user',
        action: 'STATUS_CHANGE',
        entityType: 'task',
        entityId: result.data.id,
        before: before.ok ? before.data : null,
        after: result.data,
        metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
      });
      void createJobActivityEventBestEffort({
        orgId: result.data.orgId,
        jobId: result.data.jobId,
        type: 'task_completed',
        actorCrewMemberId: actor.crewMemberId,
        payload: { taskId: result.data.id, title: result.data.title },
      });
    }
    return result;
  }

  // Use full update
  const updateContext = body?.orgId ? await requireOrgContext(req, String(body.orgId)) : null;
  if (updateContext && !updateContext.ok) return updateContext;
  const actor = updateContext ? updateContext.data.actor : { crewMemberId: null, roleKey: null, userId: null, orgId: null, capabilities: [], isImpersonating: false };
  if (updateContext && !canWriteJobArtifacts(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const beforeTask = body?.id && updateContext
    ? await getTaskById(body.id, updateContext.data.orgId)
    : null;
  if (beforeTask && !beforeTask.ok) return beforeTask;
  if (beforeTask?.ok) {
    const jobResult = await getJobById(beforeTask.data.jobId, updateContext?.data.orgId ?? '');
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, actor);
    if (!access.ok) return access;
  }
  const wasCompleted = beforeTask?.ok ? beforeTask.data.status === 'completed' : false;
  const title = beforeTask?.ok ? beforeTask.data.title || null : null;
  const isReopen = wasCompleted && body?.status === 'pending';
  const updateBody = isReopen
    ? { ...body, orgId: updateContext?.data.orgId ?? body.orgId, completedAt: null, completedBy: null }
    : { ...body, orgId: updateContext?.data.orgId ?? body.orgId };

  const result = await updateTask(updateBody);
  if (result.ok) {
    const statusChanged = beforeTask?.ok ? beforeTask.data.status !== result.data.status : false;
    void logAuditEvent({
      orgId: result.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
      entityType: 'task',
      entityId: result.data.id,
      before: beforeTask?.ok ? beforeTask.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req, { jobId: result.data.jobId }),
    });
  }
  if (result.ok && isReopen) {
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'task_reopened',
      actorCrewMemberId: actor.crewMemberId,
      payload: { taskId: result.data.id, title: title ?? result.data.title },
    });
  }

  return result;
});

/**
 * DELETE /api/tasks
 * Deletes a task.
 * 
 * Query parameters:
 * - id (required): Task ID
 * - orgId (required): Organization ID
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('id');
  const orgId = searchParams.get('orgId');

  if (!taskId) {
    return err('VALIDATION_ERROR', 'id query parameter is required');
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canWriteJobArtifacts(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const before = await getTaskById(taskId, context.data.orgId);
  if (!before.ok) return before;
  const jobResult = await getJobById(before.data.jobId, context.data.orgId);
  if (!jobResult.ok) return jobResult;
  const access = assertJobWriteAccess(jobResult.data, context.data.actor);
  if (!access.ok) return access;
  const result = await deleteTask(taskId, context.data.orgId);
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'DELETE',
      entityType: 'task',
      entityId: taskId,
      before: before.ok ? before.data : null,
      after: null,
      metadata: buildAuditMetadata(req, { jobId: before.ok ? before.data.jobId : null }),
    });
  }
  return result;
});
