import { createHash } from 'crypto';
import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import {
  listJobsByStatus,
  listJobsForDateRange,
  listJobsByCrewId,
  listAllJobsForOrg,
} from '@/lib/queries/jobs';
import { createJob, updateJob, updateJobStatus } from '@/lib/mutations/jobs';
import type { JobStatus } from '@/lib/validators/jobs';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs, canUpdateJobs, canViewJobs } from '@/lib/authz';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { emitCommEvent } from '@/lib/communications/emit';
import { getJobById } from '@/lib/queries/jobs';
import { listJobMaterialAllocations } from '@/lib/queries/job_material_allocations';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

function hashToUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * GET /api/jobs
 * Query parameters:
 * - orgId (required)
 * - all=true (optional): return all jobs (no filtering)
 * - crewId (optional): filter by crewId, crewId=null for unassigned
 * - status (optional): filter by job status
 * - start, end (optional): date range ISO strings
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const resolvedOrgId = context.data.orgId;

  const all = searchParams.get('all');
  if (all === 'true') {
    return await listAllJobsForOrg(resolvedOrgId, context.data.actor);
  }

  const crewId = searchParams.get('crewId');
  if (crewId !== null) {
    const crewIdValue = crewId === 'null' ? null : crewId;
    return await listJobsByCrewId(resolvedOrgId, crewIdValue, context.data.actor);
  }

  const status = searchParams.get('status');
  if (status) {
    return await listJobsByStatus(resolvedOrgId, status as JobStatus, context.data.actor);
  }

  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid date format for start or end');
    }
    return await listJobsForDateRange(resolvedOrgId, startDate, endDate, context.data.actor);
  }

  return err(
    'VALIDATION_ERROR',
    'Invalid query parameters. Provide either all=true, crewId, status, or both start and end'
  );
});

/**
 * POST /api/jobs
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const result = await createJob({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'job',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'job.created',
      payload: {
        jobId: result.data.id,
        status: result.data.status,
        crewId: result.data.crewId ?? null,
        jobTypeId: result.data.jobTypeId ?? null,
        jobTitle: result.data.title,
      },
      actorUserId: context.data.actor.userId,
    });
    void emitCommEvent({
      orgId: context.data.orgId,
      eventKey: 'job_created',
      entityType: 'job',
      entityId: result.data.id,
      triggeredByUserId: context.data.actor.userId,
      payload: {
        jobId: result.data.id,
        status: result.data.status,
        crewId: result.data.crewId ?? null,
        jobTitle: result.data.title,
      },
      actorRoleKey: context.data.actor.roleKey,
    });
  }
  return result;
});

/**
 * PATCH /api/jobs
 * Special case: status-only update calls updateJobStatus.
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const canManage = canManageJobs(context.data.actor);
  const canUpdate = canUpdateJobs(context.data.actor);

  const jobId = body?.id ? String(body.id) : null;
  const previous = jobId ? await getJobById(jobId, context.data.orgId) : null;
  if (previous && !previous.ok) return previous;
  if (previous?.ok) {
    const access = assertJobWriteAccess(previous.data, context.data.actor);
    if (!access.ok) return access;
  }

  const hasOnlyStatusUpdate =
    body?.id &&
    context.data.orgId &&
    body?.status !== undefined &&
    Object.keys(body).length === 3;

  if (hasOnlyStatusUpdate) {
    if (!canUpdate) return err('FORBIDDEN', 'Insufficient permissions');
    const result = await updateJobStatus(body.id, context.data.orgId, body.status);
    if (result.ok) {
      const before = previous?.ok ? previous.data : null;
      const statusChanged = before?.status !== result.data.status;
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: context.data.actor.userId,
        actorType: 'user',
        action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
        entityType: 'job',
        entityId: result.data.id,
        before,
        after: result.data,
        metadata: buildAuditMetadata(req),
      });
      const previousStatus = previous?.ok ? previous.data.status : null;
      if (!previousStatus || previousStatus !== result.data.status) {
        void emitAppEvent({
          orgId: context.data.orgId,
          eventType: 'job.status.updated',
          payload: {
            jobId: result.data.id,
            status: result.data.status,
            crewId: result.data.crewId ?? null,
            jobTypeId: result.data.jobTypeId ?? null,
            jobTitle: result.data.title,
          },
          actorUserId: context.data.actor.userId,
        });
        void emitCommEvent({
          orgId: context.data.orgId,
          eventKey: 'job_status_changed',
          entityType: 'job_status',
          entityId: hashToUuid(`${result.data.id}:${previousStatus ?? 'unknown'}->${result.data.status}`),
          triggeredByUserId: context.data.actor.userId,
          payload: {
            jobId: result.data.id,
            status: result.data.status,
            previousStatus,
            crewId: result.data.crewId ?? null,
            jobTitle: result.data.title,
          },
          actorRoleKey: context.data.actor.roleKey,
        });

        if (result.data.status === 'in_progress') {
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.started',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
        }

        if (result.data.status === 'completed') {
          const materialsResult = await listJobMaterialAllocations({ orgId: context.data.orgId, jobId: result.data.id });
          const materials = materialsResult.ok
            ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
            : [];
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.completed',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, materials, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
          void emitCommEvent({
            orgId: context.data.orgId,
            eventKey: 'job_completed',
            entityType: 'job',
            entityId: result.data.id,
            triggeredByUserId: context.data.actor.userId,
            payload: {
              jobId: result.data.id,
              status: result.data.status,
              crewId: result.data.crewId ?? null,
              materials,
              jobTitle: result.data.title,
            },
            actorRoleKey: context.data.actor.roleKey,
          });
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'crew.job.completed',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, materials, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
        }
      }
    }
    return result;
  }

  if (!canManage) return err('FORBIDDEN', 'Insufficient permissions');
  const result = await updateJob({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    const before = previous?.ok ? previous.data : null;
    const statusChanged = before?.status !== result.data.status;
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
      entityType: 'job',
      entityId: result.data.id,
      before,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
    if (body?.status !== undefined) {
      const previousStatus = previous?.ok ? previous.data.status : null;
      if (!previousStatus || previousStatus !== result.data.status) {
        void emitAppEvent({
          orgId: context.data.orgId,
          eventType: 'job.status.updated',
          payload: {
            jobId: result.data.id,
            status: result.data.status,
            crewId: result.data.crewId ?? null,
            jobTypeId: result.data.jobTypeId ?? null,
            jobTitle: result.data.title,
          },
          actorUserId: context.data.actor.userId,
        });
        void emitCommEvent({
          orgId: context.data.orgId,
          eventKey: 'job_status_changed',
          entityType: 'job_status',
          entityId: hashToUuid(`${result.data.id}:${previousStatus ?? 'unknown'}->${result.data.status}`),
          triggeredByUserId: context.data.actor.userId,
          payload: {
            jobId: result.data.id,
            status: result.data.status,
            previousStatus,
            crewId: result.data.crewId ?? null,
            jobTitle: result.data.title,
          },
          actorRoleKey: context.data.actor.roleKey,
        });

        if (result.data.status === 'in_progress') {
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.started',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
        }

        if (result.data.status === 'completed') {
          const materialsResult = await listJobMaterialAllocations({ orgId: context.data.orgId, jobId: result.data.id });
          const materials = materialsResult.ok
            ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
            : [];
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.completed',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, materials, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
          void emitCommEvent({
            orgId: context.data.orgId,
            eventKey: 'job_completed',
            entityType: 'job',
            entityId: result.data.id,
            triggeredByUserId: context.data.actor.userId,
            payload: {
              jobId: result.data.id,
              status: result.data.status,
              crewId: result.data.crewId ?? null,
              materials,
              jobTitle: result.data.title,
            },
            actorRoleKey: context.data.actor.roleKey,
          });
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'crew.job.completed',
            payload: { jobId: result.data.id, status: result.data.status, crewId: result.data.crewId ?? null, materials, jobTitle: result.data.title },
            actorUserId: context.data.actor.userId,
          });
        }
      }
    }

    const financialFields = ['estimatedRevenueCents', 'estimatedCostCents', 'targetMarginPercent', 'revenueOverrideCents'];
    if (financialFields.some((key) => key in body)) {
      void evaluateJobGuardrailsBestEffort({
        orgId: context.data.orgId,
        jobId: result.data.id,
        actorUserId: context.data.actor.userId,
      });
    }
  }

  return result;
});
