import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createScheduleAssignment,
  updateScheduleAssignment,
  deleteScheduleAssignment,
} from '@/lib/mutations/schedule_assignments';
import {
  listScheduleAssignments,
  listScheduleAssignmentsByDate,
  getScheduleAssignmentById,
  listScheduleAssignmentsByJobId,
} from '@/lib/queries/schedule_assignments';
import { getJobById, getJobsByIds } from '@/lib/queries/jobs';
import { listJobMaterialAllocations } from '@/lib/queries/job_material_allocations';
import { listClientsByIds } from '@/lib/queries/clients';
import { dbAssignmentToFrontend } from '@/lib/types/schedule';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { assertJobWriteAccess, canManageSchedule, canViewSchedule } from '@/lib/authz';
import { requireOrgContext } from '@/lib/auth/require';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { emitCommEvent } from '@/lib/communications/emit';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

function authErrorResponse(error: { code: string; message: string }) {
  const status = error.code === 'UNAUTHORIZED' ? 401 : error.code === 'FORBIDDEN' ? 403 : 400;
  return NextResponse.json({ ok: false, error }, { status });
}

function hashToUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * GET /api/schedule-assignments
 * 
 * Query parameters:
 * - orgId: required
 * - startDate: optional (ISO string)
 * - endDate: optional (ISO string)
 * - date: optional (ISO string) - get assignments for a specific date
 * - jobId: optional - get assignments for a specific job
 * 
 * Returns schedule assignments with joined job data.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return authErrorResponse(context.error);
    if (!canViewSchedule(context.data.actor)) {
      return authErrorResponse({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    const resolvedOrgId = context.data.orgId;
    
    // Handle different query modes
    const dateParam = searchParams.get('date');
    const jobIdParam = searchParams.get('jobId');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    let assignmentsResult;
    
    if (dateParam) {
      // Get assignments for a specific date
      const date = new Date(dateParam);
      assignmentsResult = await listScheduleAssignmentsByDate(resolvedOrgId, date, context.data.actor);
    } else if (jobIdParam) {
      // Get assignments for a specific job
      assignmentsResult = await listScheduleAssignmentsByJobId(jobIdParam, resolvedOrgId, context.data.actor);
    } else if (startDateParam && endDateParam) {
      // Get assignments for a date range
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);
      assignmentsResult = await listScheduleAssignments(resolvedOrgId, startDate, endDate, context.data.actor);
    } else {
      // Default: get assignments for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      assignmentsResult = await listScheduleAssignments(resolvedOrgId, today, tomorrow, context.data.actor);
    }
    
    if (!assignmentsResult.ok) {
      return NextResponse.json(
        { ok: false, error: assignmentsResult.error.message },
        { status: 500 }
      );
    }
    
    // Join job data
    const jobIds = [...new Set(assignmentsResult.data.map(a => a.jobId))];
    const jobsResult = await getJobsByIds(jobIds, resolvedOrgId, context.data.actor);
    
    if (!jobsResult.ok) {
      return NextResponse.json(
        { ok: false, error: jobsResult.error.message },
        { status: 500 }
      );
    }
    
    const clientIds = [...new Set(jobsResult.data.map(job => job.clientId).filter((id): id is string => Boolean(id)))];
    const clientsResult = await listClientsByIds({ orgId: resolvedOrgId, clientIds });
    const clientNameById = clientsResult.ok
      ? new Map(clientsResult.data.map(client => [client.id, client.displayName]))
      : new Map();

    const jobsWithClients = jobsResult.data.map((job) => ({
      ...job,
      clientDisplayName: job.clientId ? clientNameById.get(job.clientId) ?? null : null,
    }));

    // Create a map of jobId -> job
    const jobsMap = new Map(jobsWithClients.map(job => [job.id, job]));
    
    // Combine assignments with job data
    const assignmentsWithJobs = assignmentsResult.data
      .map(assignment => {
        const job = jobsMap.get(assignment.jobId);
        if (!job) {
          console.warn(`Job ${assignment.jobId} not found for assignment ${assignment.id}`);
          return null;
        }
        return dbAssignmentToFrontend(assignment, job);
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    
    return NextResponse.json({
      ok: true,
      data: assignmentsWithJobs,
    });
  } catch (error) {
    console.error('Error in GET /api/schedule-assignments:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedule-assignments
 * 
 * Body: CreateScheduleAssignmentInput
 * 
 * Creates a new schedule assignment.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const context = await requireOrgContext(request, body?.orgId ? String(body.orgId) : null);
    if (!context.ok) return authErrorResponse(context.error);
    if (!canManageSchedule(context.data.actor)) {
      return authErrorResponse({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    const jobId = body?.jobId ? String(body.jobId) : null;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const jobResult = await getJobById(jobId, context.data.orgId);
    if (!jobResult.ok) {
      return NextResponse.json(
        { ok: false, error: jobResult.error.message },
        { status: jobResult.error.code === 'NOT_FOUND' ? 404 : 400 }
      );
    }
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) {
      return authErrorResponse({ code: access.error.code, message: access.error.message });
    }

    const result = await createScheduleAssignment({ ...body, orgId: context.data.orgId });
    
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error.message },
        { status: 400 }
      );
    }

    const actor = context.data.actor;
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'schedule',
      entityId: result.data.jobId,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(request, {
        assignmentId: result.data.id,
        jobId: result.data.jobId,
        crewId: result.data.crewId,
      }),
    });
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'schedule_assignment_created',
      actorCrewMemberId: actor.crewMemberId,
      payload: {
        assignmentId: result.data.id,
        crewId: result.data.crewId,
        date: result.data.date?.toISOString?.() ?? null,
        startMinutes: result.data.startMinutes,
        endMinutes: result.data.endMinutes,
        assignmentType: result.data.assignmentType,
        startAtHq: result.data.startAtHq ?? false,
        endAtHq: result.data.endAtHq ?? false,
      },
    });

    const materialsResult = await listJobMaterialAllocations({ orgId: context.data.orgId, jobId: result.data.jobId });
    const materials = materialsResult.ok
      ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
      : [];

    const payload = {
      assignmentId: result.data.id,
      jobId: result.data.jobId,
      crewId: result.data.crewId,
      date: result.data.date ? result.data.date.toISOString() : undefined,
      startMinutes: result.data.startMinutes,
      endMinutes: result.data.endMinutes,
      assignmentType: result.data.assignmentType,
      status: result.data.status,
      startAtHq: result.data.startAtHq ?? false,
      endAtHq: result.data.endAtHq ?? false,
      materials,
    };
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'schedule.updated',
      payload,
      actorUserId: actor.userId,
    });
    if (result.data.crewId) {
      void emitAppEvent({
        orgId: context.data.orgId,
        eventType: 'job.assigned',
        payload,
        actorUserId: actor.userId,
      });
      void emitCommEvent({
        orgId: context.data.orgId,
        eventKey: 'job_assigned',
        entityType: 'schedule_assignment',
        entityId: hashToUuid(`${result.data.id}:${result.data.crewId ?? 'none'}`),
        triggeredByUserId: actor.userId,
        payload: {
          jobId: result.data.jobId,
          assignmentId: result.data.id,
          crewId: result.data.crewId,
          date: result.data.date ? result.data.date.toISOString() : undefined,
          startMinutes: result.data.startMinutes,
          endMinutes: result.data.endMinutes,
          assignmentType: result.data.assignmentType,
          status: result.data.status,
          startAtHq: result.data.startAtHq ?? false,
          endAtHq: result.data.endAtHq ?? false,
        },
        actorRoleKey: actor.roleKey,
      });
    }
    void emitCommEvent({
      orgId: context.data.orgId,
      eventKey: 'job_scheduled',
      entityType: 'schedule_assignment',
      entityId: hashToUuid(
        `${result.data.id}:${result.data.date ? result.data.date.toISOString() : ''}:${result.data.startMinutes}:${result.data.endMinutes}`
      ),
      triggeredByUserId: actor.userId,
      payload: {
        jobId: result.data.jobId,
        assignmentId: result.data.id,
        crewId: result.data.crewId,
        date: result.data.date ? result.data.date.toISOString() : undefined,
        startMinutes: result.data.startMinutes,
        endMinutes: result.data.endMinutes,
        assignmentType: result.data.assignmentType,
        status: result.data.status,
        startAtHq: result.data.startAtHq ?? false,
        endAtHq: result.data.endAtHq ?? false,
      },
      actorRoleKey: actor.roleKey,
    });
    
    // Fetch the job to return complete assignment with job data
    const { getJobsByIds } = await import('@/lib/queries/jobs');
    const jobsResult = await getJobsByIds([result.data.jobId], context.data.orgId, context.data.actor);
    
    if (!jobsResult.ok || jobsResult.data.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch job data' },
        { status: 500 }
      );
    }
    
    const clientIds = [...new Set(jobsResult.data.map(job => job.clientId).filter((id): id is string => Boolean(id)))];
    const clientsResult = await listClientsByIds({ orgId: context.data.orgId, clientIds });
    const clientNameById = clientsResult.ok
      ? new Map(clientsResult.data.map(client => [client.id, client.displayName]))
      : new Map();
    const jobWithClient = {
      ...jobsResult.data[0],
      clientDisplayName: jobsResult.data[0].clientId
        ? clientNameById.get(jobsResult.data[0].clientId) ?? null
        : null,
    };
    const assignmentWithJob = dbAssignmentToFrontend(result.data, jobWithClient);
    
    return NextResponse.json({
      ok: true,
      data: assignmentWithJob,
    });
  } catch (error) {
    console.error('Error in POST /api/schedule-assignments:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/schedule-assignments
 * 
 * Body: UpdateScheduleAssignmentInput
 * 
 * Updates an existing schedule assignment.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const context = await requireOrgContext(request, body?.orgId ? String(body.orgId) : null);
    if (!context.ok) return authErrorResponse(context.error);
    if (!canManageSchedule(context.data.actor)) {
      return authErrorResponse({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    const previous = await getScheduleAssignmentById(String(body.id), context.data.orgId);
    if (!previous.ok) {
      return NextResponse.json(
        { ok: false, error: previous.error.message },
        { status: previous.error.code === 'NOT_FOUND' ? 404 : 400 }
      );
    }
    const jobResult = await getJobById(previous.data.jobId, context.data.orgId);
    if (!jobResult.ok) {
      return NextResponse.json(
        { ok: false, error: jobResult.error.message },
        { status: jobResult.error.code === 'NOT_FOUND' ? 404 : 400 }
      );
    }
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) {
      return authErrorResponse({ code: access.error.code, message: access.error.message });
    }
    const result = await updateScheduleAssignment({ ...body, orgId: context.data.orgId });
    
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error.message },
        { status: 400 }
      );
    }

    const actor = context.data.actor;
    const before = previous.ok ? previous.data : null;
    const crewChanged = before ? before.crewId !== result.data.crewId : false;
    const dateChanged =
      before && before.date && result.data.date
        ? before.date.toISOString() !== result.data.date.toISOString()
        : false;
    const timeChanged =
      before ? before.startMinutes !== result.data.startMinutes || before.endMinutes !== result.data.endMinutes : false;
    const action = crewChanged ? 'ASSIGN' : dateChanged || timeChanged ? 'RESCHEDULE' : 'UPDATE';
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action,
      entityType: 'schedule',
      entityId: result.data.jobId,
      before,
      after: result.data,
      metadata: buildAuditMetadata(request, {
        assignmentId: result.data.id,
        jobId: result.data.jobId,
        crewId: result.data.crewId,
      }),
    });
    void createJobActivityEventBestEffort({
      orgId: result.data.orgId,
      jobId: result.data.jobId,
      type: 'schedule_assignment_updated',
      actorCrewMemberId: actor.crewMemberId,
      payload: {
        assignmentId: result.data.id,
        crewId: result.data.crewId,
        date: result.data.date?.toISOString?.() ?? null,
        startMinutes: result.data.startMinutes,
        endMinutes: result.data.endMinutes,
        assignmentType: result.data.assignmentType,
        status: result.data.status,
        startAtHq: result.data.startAtHq ?? false,
        endAtHq: result.data.endAtHq ?? false,
      },
    });

    const materialsResult = await listJobMaterialAllocations({ orgId: context.data.orgId, jobId: result.data.jobId });
    const materials = materialsResult.ok
      ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
      : [];

    const payload = {
      assignmentId: result.data.id,
      jobId: result.data.jobId,
      crewId: result.data.crewId,
      date: result.data.date ? result.data.date.toISOString() : undefined,
      startMinutes: result.data.startMinutes,
      endMinutes: result.data.endMinutes,
      assignmentType: result.data.assignmentType,
      status: result.data.status,
      startAtHq: result.data.startAtHq ?? false,
      endAtHq: result.data.endAtHq ?? false,
      materials,
    };
    void emitAppEvent({
      orgId: context.data.orgId,
      eventType: 'schedule.updated',
      payload,
      actorUserId: actor.userId,
    });

    if (previous.ok) {
      const prev = previous.data;
      const crewChanged = prev.crewId !== result.data.crewId;
      const timeChanged =
        prev.startMinutes !== result.data.startMinutes ||
        prev.endMinutes !== result.data.endMinutes ||
        prev.assignmentType !== result.data.assignmentType ||
        (prev.date?.toISOString?.() ?? '') !== (result.data.date?.toISOString?.() ?? '');

      if (crewChanged) {
        if (prev.crewId) {
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.unassigned',
            payload: {
              assignmentId: prev.id,
              jobId: prev.jobId,
              crewId: prev.crewId,
              date: prev.date ? prev.date.toISOString() : undefined,
              startMinutes: prev.startMinutes,
              endMinutes: prev.endMinutes,
              assignmentType: prev.assignmentType,
              status: prev.status,
              materials,
            },
            actorUserId: actor.userId,
          });
        }
        if (result.data.crewId) {
          void emitAppEvent({
            orgId: context.data.orgId,
            eventType: 'job.assigned',
            payload,
            actorUserId: actor.userId,
          });
          void emitCommEvent({
            orgId: context.data.orgId,
            eventKey: 'job_assigned',
            entityType: 'schedule_assignment',
            entityId: hashToUuid(`${result.data.id}:${result.data.crewId ?? 'none'}`),
            triggeredByUserId: actor.userId,
            payload: {
              jobId: result.data.jobId,
              assignmentId: result.data.id,
              crewId: result.data.crewId,
              date: result.data.date ? result.data.date.toISOString() : undefined,
              startMinutes: result.data.startMinutes,
              endMinutes: result.data.endMinutes,
              assignmentType: result.data.assignmentType,
              status: result.data.status,
              previousCrewId: prev.crewId,
              startAtHq: result.data.startAtHq ?? false,
              endAtHq: result.data.endAtHq ?? false,
            },
            actorRoleKey: actor.roleKey,
          });
        }
      } else if (timeChanged) {
        void emitAppEvent({
          orgId: context.data.orgId,
          eventType: 'job.rescheduled',
          payload,
          actorUserId: actor.userId,
        });
        void emitCommEvent({
          orgId: context.data.orgId,
          eventKey: 'job_rescheduled',
          entityType: 'schedule_assignment',
          entityId: hashToUuid(
            `${result.data.id}:${result.data.date ? result.data.date.toISOString() : ''}:${result.data.startMinutes}:${result.data.endMinutes}`
          ),
          triggeredByUserId: actor.userId,
          payload: {
            jobId: result.data.jobId,
            assignmentId: result.data.id,
            crewId: result.data.crewId,
            date: result.data.date ? result.data.date.toISOString() : undefined,
            startMinutes: result.data.startMinutes,
            endMinutes: result.data.endMinutes,
            assignmentType: result.data.assignmentType,
            status: result.data.status,
            startAtHq: result.data.startAtHq ?? false,
            endAtHq: result.data.endAtHq ?? false,
          },
          actorRoleKey: actor.roleKey,
        });
      }

      if (result.data.status === 'cancelled' && prev.status !== 'cancelled') {
        void emitCommEvent({
          orgId: context.data.orgId,
          eventKey: 'job_cancelled',
          entityType: 'schedule_assignment',
          entityId: hashToUuid(`${result.data.id}:cancelled`),
          triggeredByUserId: actor.userId,
        payload: {
          jobId: result.data.jobId,
          assignmentId: result.data.id,
          crewId: result.data.crewId,
          date: result.data.date ? result.data.date.toISOString() : undefined,
          startMinutes: result.data.startMinutes,
          endMinutes: result.data.endMinutes,
          assignmentType: result.data.assignmentType,
          status: result.data.status,
          startAtHq: result.data.startAtHq ?? false,
          endAtHq: result.data.endAtHq ?? false,
        },
        actorRoleKey: actor.roleKey,
      });
      }
    }
    
    // Fetch the job to return complete assignment with job data
    const { getJobsByIds } = await import('@/lib/queries/jobs');
    const jobsResult = await getJobsByIds([result.data.jobId], context.data.orgId, context.data.actor);
    
    if (!jobsResult.ok || jobsResult.data.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch job data' },
        { status: 500 }
      );
    }
    
    const clientIds = [...new Set(jobsResult.data.map(job => job.clientId).filter((id): id is string => Boolean(id)))];
    const clientsResult = await listClientsByIds({ orgId: context.data.orgId, clientIds });
    const clientNameById = clientsResult.ok
      ? new Map(clientsResult.data.map(client => [client.id, client.displayName]))
      : new Map();
    const jobWithClient = {
      ...jobsResult.data[0],
      clientDisplayName: jobsResult.data[0].clientId
        ? clientNameById.get(jobsResult.data[0].clientId) ?? null
        : null,
    };
    const assignmentWithJob = dbAssignmentToFrontend(result.data, jobWithClient);
    
    return NextResponse.json({
      ok: true,
      data: assignmentWithJob,
    });
  } catch (error) {
    console.error('Error in PATCH /api/schedule-assignments:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schedule-assignments
 * 
 * Query parameters:
 * - id: assignment ID
 * - orgId: organization ID
 * 
 * Deletes a schedule assignment.
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const orgId = searchParams.get('orgId');
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return authErrorResponse(context.error);
    if (!canManageSchedule(context.data.actor)) {
      return authErrorResponse({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    const actor = context.data.actor;
    const existing = await getScheduleAssignmentById(id, context.data.orgId);
    if (!existing.ok) {
      return NextResponse.json(
        { ok: false, error: existing.error.message },
        { status: existing.error.code === 'NOT_FOUND' ? 404 : 400 }
      );
    }
    const jobResult = await getJobById(existing.data.jobId, context.data.orgId);
    if (!jobResult.ok) {
      return NextResponse.json(
        { ok: false, error: jobResult.error.message },
        { status: jobResult.error.code === 'NOT_FOUND' ? 404 : 400 }
      );
    }
    const access = assertJobWriteAccess(jobResult.data, actor);
    if (!access.ok) {
      return authErrorResponse({ code: access.error.code, message: access.error.message });
    }
    
    const result = await deleteScheduleAssignment(id, context.data.orgId);
    
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error.message },
        { status: 400 }
      );
    }

    if (existing.ok) {
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: actor.userId,
        actorType: 'user',
        action: 'DELETE',
        entityType: 'schedule',
        entityId: existing.data.jobId,
        before: existing.data,
        after: null,
        metadata: buildAuditMetadata(request, {
          assignmentId: id,
          jobId: existing.data.jobId,
          crewId: existing.data.crewId,
        }),
      });
      void createJobActivityEventBestEffort({
        orgId: context.data.orgId,
        jobId: existing.data.jobId,
        type: 'schedule_assignment_deleted',
        actorCrewMemberId: actor.crewMemberId,
        payload: {
          assignmentId: id,
          crewId: existing.data.crewId,
          date: existing.data.date?.toISOString?.() ?? null,
          startMinutes: existing.data.startMinutes,
          endMinutes: existing.data.endMinutes,
          assignmentType: existing.data.assignmentType,
        },
      });

      const materialsResult = await listJobMaterialAllocations({ orgId: context.data.orgId, jobId: existing.data.jobId });
      const materials = materialsResult.ok
        ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
        : [];

      const payload = {
        assignmentId: existing.data.id,
        jobId: existing.data.jobId,
        crewId: existing.data.crewId,
        date: existing.data.date ? existing.data.date.toISOString() : undefined,
        startMinutes: existing.data.startMinutes,
        endMinutes: existing.data.endMinutes,
        assignmentType: existing.data.assignmentType,
        status: existing.data.status,
        materials,
      };
      void emitAppEvent({
        orgId: context.data.orgId,
        eventType: 'schedule.updated',
        payload,
        actorUserId: actor.userId,
      });
      if (existing.data.crewId) {
        void emitAppEvent({
          orgId: context.data.orgId,
          eventType: 'job.unassigned',
          payload,
          actorUserId: actor.userId,
        });
      }
      void emitCommEvent({
        orgId: context.data.orgId,
        eventKey: 'job_cancelled',
        entityType: 'schedule_assignment',
        entityId: hashToUuid(`${existing.data.id}:cancelled`),
        triggeredByUserId: actor.userId,
        payload: {
          jobId: existing.data.jobId,
          assignmentId: existing.data.id,
          crewId: existing.data.crewId,
          date: existing.data.date ? existing.data.date.toISOString() : undefined,
          startMinutes: existing.data.startMinutes,
          endMinutes: existing.data.endMinutes,
          assignmentType: existing.data.assignmentType,
          status: existing.data.status,
        },
        actorRoleKey: actor.roleKey,
      });
    }
    
    return NextResponse.json({
      ok: true,
      data: null,
    });
  } catch (error) {
    console.error('Error in DELETE /api/schedule-assignments:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
