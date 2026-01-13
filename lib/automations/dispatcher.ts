import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { automationActionsOutbox } from '@/db/schema/automation_actions_outbox';
import { automationRuns } from '@/db/schema/automation_runs';
import { appEvents } from '@/db/schema/app_events';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { resolveAutomationContext } from '@/lib/automations/context';
import { automationActionSchema } from '@/lib/validators/automations';
import type { AutomationActionNode, AutomationActionScheduleCreate, RecipientReference } from '@/lib/automations/types';
import { emitCommEvent } from '@/lib/communications/emit';
import { createNotificationBestEffort } from '@/lib/mutations/notifications';
import { getJobById } from '@/lib/queries/jobs';
import { listJobMaterialAllocations } from '@/lib/queries/job_material_allocations';
import { updateJob } from '@/lib/mutations/jobs';
import type { UpdateJobInput } from '@/lib/validators/jobs';
import { createScheduleAssignment, updateScheduleAssignment } from '@/lib/mutations/schedule_assignments';
import { getScheduleAssignmentById, listScheduleAssignmentsByDate } from '@/lib/queries/schedule_assignments';
import type { CreateScheduleAssignmentInput, UpdateScheduleAssignmentInput } from '@/lib/validators/schedule_assignments';
import { createMaterialInventoryEvent } from '@/lib/mutations/material_inventory_events';
import { createTask } from '@/lib/mutations/tasks';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { buildOccupiedTimeline, resolvePlacement } from '@/schedule-v2';
import { AUTOMATIONS_DISPATCH_BATCH } from '@/lib/automations/constants';
import { getDb } from '@/lib/db';

type DbClient = ReturnType<typeof getDb>;
type AutomationContextResolved = Awaited<ReturnType<typeof resolveAutomationContext>>;

type ActionResult = {
  ok: boolean;
  retryable: boolean;
  error?: string;
  providerMessageId?: string | null;
};

const MAX_ATTEMPTS = 3;

function buildBackoff(attempt: number): Date {
  const minutes = Math.min(60, Math.pow(2, attempt) * 5);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function normalizeRecipients(refs: RecipientReference[] | undefined, context: AutomationContextResolved) {
  const resolved: Array<{
    type: 'client' | 'user' | 'custom';
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    roleKey?: string | null;
    crewMemberId?: string | null;
  }> = [];

  const refsList = refs ?? [];
  const crewIds = new Set(
    context.crew
      .map((crew) => (crew as { id?: string }).id)
      .filter((id): id is string => typeof id === 'string')
  );

  for (const ref of refsList) {
    if (ref.type === 'ref') {
      if (ref.ref === 'job.client' && context.contacts.client) {
        const contact = context.contacts.client as { email?: string | null; phone?: string | null; name?: string | null };
        resolved.push({
          type: 'client',
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          name: contact.name ?? null,
        });
      }
      if (ref.ref === 'job.site_contacts') {
        for (const contact of context.contacts.siteContacts) {
          const typed = contact as { email?: string | null; phone?: string | null; name?: string | null };
          resolved.push({
            type: 'custom',
            email: typed.email ?? null,
            phone: typed.phone ?? null,
            name: typed.name ?? null,
          });
        }
      }
      if (ref.ref === 'crew.assigned') {
        for (const user of context.orgUsers) {
          if (user.crewMemberId && crewIds.has(user.crewMemberId)) {
            resolved.push({
              type: 'user',
              userId: user.userId,
              email: user.email ?? null,
              name: user.name ?? null,
              roleKey: user.roleKey ?? null,
              crewMemberId: user.crewMemberId ?? null,
            });
          }
        }
        for (const crewMember of context.crew) {
          const typed = crewMember as { id?: string; email?: string | null; phone?: string | null; displayName?: string | null };
          if (typed.email || typed.phone) {
            resolved.push({
              type: 'custom',
              email: typed.email ?? null,
              phone: typed.phone ?? null,
              name: typed.displayName ?? null,
              crewMemberId: typed.id ?? null,
            });
          }
        }
      }
      if (ref.ref === 'org.admins') {
        for (const user of context.orgUsers) {
          const role = user.roleKey ? user.roleKey.toLowerCase() : '';
          if (role === 'admin' || role === 'manager') {
            resolved.push({
              type: 'user',
              userId: user.userId,
              email: user.email ?? null,
              name: user.name ?? null,
              roleKey: user.roleKey ?? null,
              crewMemberId: user.crewMemberId ?? null,
            });
          }
        }
      }
      if (ref.ref === 'org.staff') {
        for (const user of context.orgUsers) {
          resolved.push({
            type: 'user',
            userId: user.userId,
            email: user.email ?? null,
            name: user.name ?? null,
            roleKey: user.roleKey ?? null,
            crewMemberId: user.crewMemberId ?? null,
          });
        }
      }
      continue;
    }

    if (ref.type === 'user') {
      const match = context.orgUsers.find((user) => user.userId === ref.userId);
      resolved.push({
        type: 'user',
        userId: ref.userId,
        email: match?.email ?? null,
        name: match?.name ?? null,
        roleKey: match?.roleKey ?? null,
        crewMemberId: match?.crewMemberId ?? null,
      });
      continue;
    }

    if (ref.type === 'email') {
      resolved.push({ type: 'custom', email: ref.email, phone: null, name: ref.email });
      continue;
    }

    if (ref.type === 'phone') {
      resolved.push({ type: 'custom', email: null, phone: ref.phone, name: ref.phone });
    }
  }

  const deduped = new Map<string, typeof resolved[number]>();
  for (const recipient of resolved) {
    const key = recipient.userId ? `user:${recipient.userId}` : `contact:${recipient.email ?? recipient.phone ?? recipient.name ?? ''}`;
    if (!deduped.has(key)) deduped.set(key, recipient);
  }

  return Array.from(deduped.values());
}

function extractAutomationDepth(payload: Record<string, unknown>): number {
  const automation = payload.automation as Record<string, unknown> | undefined;
  const depth = typeof automation?.depth === 'number' && Number.isFinite(automation.depth) ? automation.depth : 0;
  return depth;
}

async function executeAction(params: {
  orgId: string;
  action: AutomationActionNode;
  event: typeof appEvents.$inferSelect;
  context: Awaited<ReturnType<typeof resolveAutomationContext>>;
  outboxId: string;
}): Promise<ActionResult> {
  const payload = (params.event.payload ?? {}) as Record<string, unknown>;
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : null;
  const lineageDepth = extractAutomationDepth(payload);
  const automationMeta = {
    automation: {
      parentEventId: params.event.id,
      depth: lineageDepth + 1,
    },
  };

  if (params.action.type === 'comms.send') {
    if (!params.action.params.eventKey) {
      return { ok: false, retryable: false, error: 'Missing comms event key' };
    }
    const recipients = normalizeRecipients(params.action.params.recipients, params.context);
    const eventPayload = {
      ...payload,
      ...automationMeta,
      jobId: jobId ?? null,
      assignmentId: typeof payload.assignmentId === 'string' ? payload.assignmentId : null,
      recipients,
      forceChannels: [params.action.params.channel],
      variables: params.action.params.variables ?? {},
    };
    const commEventId = await emitCommEvent({
      orgId: params.orgId,
      eventKey: params.action.params.eventKey,
      entityType: 'automation_action',
      entityId: params.outboxId,
      triggeredByUserId: params.event.actorUserId ?? null,
      payload: eventPayload,
      actorRoleKey: 'system',
    });
    if (!commEventId) {
      return { ok: false, retryable: true, error: 'Failed to emit comms event' };
    }
    return { ok: true, retryable: false, providerMessageId: commEventId };
  }

  if (params.action.type === 'notification.create') {
    const recipients = normalizeRecipients(params.action.params.recipients, params.context).filter((r) => r.userId);
    if (recipients.length === 0) {
      return { ok: true, retryable: false };
    }
    for (const recipient of recipients) {
      await createNotificationBestEffort({
        orgId: params.orgId,
        type: 'automation',
        message: `${params.action.params.title}: ${params.action.params.body}`,
        jobId: jobId ?? null,
        eventKey: `automation:${params.outboxId}:${recipient.userId}`,
        recipientUserId: recipient.userId ?? null,
      });
    }
    return { ok: true, retryable: false };
  }

  if (params.action.type === 'job.update') {
    const resolvedJobId = params.action.params.jobId ?? jobId;
    if (!resolvedJobId) {
      return { ok: false, retryable: false, error: 'Job ID is required' };
    }
    const before = await getJobById(resolvedJobId, params.orgId);
    if (!before.ok) {
      return { ok: false, retryable: false, error: before.error.message };
    }

    const updates = { ...params.action.params.updates };
    if (!updates.scheduledEnd && updates.dueDate) {
      updates.scheduledEnd = updates.dueDate;
    }
    const progressStatus =
      typeof updates.progressStatus === 'string' ? (updates.progressStatus as UpdateJobInput['progressStatus']) : undefined;
    const status =
      typeof updates.status === 'string' &&
      ['unassigned', 'scheduled', 'in_progress', 'completed'].includes(updates.status)
        ? (updates.status as UpdateJobInput['status'])
        : undefined;
    const result = await updateJob({
      id: resolvedJobId,
      orgId: params.orgId,
      status,
      progressStatus,
      crewId: updates.crewId ?? undefined,
      scheduledStart: updates.scheduledStart ?? undefined,
      scheduledEnd: updates.scheduledEnd ?? undefined,
    });
    if (!result.ok) {
      return { ok: false, retryable: false, error: result.error.message };
    }

    const after = result.data;
    const statusChanged = before.data.status !== after.status;
    const progressChanged = before.data.progressStatus !== after.progressStatus;
    const payloadBase = {
      jobId: after.id,
      status: after.status,
      crewId: after.crewId ?? null,
      jobTypeId: after.jobTypeId ?? null,
      jobTitle: after.title,
      ...automationMeta,
    };

    if (statusChanged) {
      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job.status.updated',
        payload: payloadBase,
        actorUserId: params.event.actorUserId ?? null,
      });

      if (after.status === 'in_progress') {
        void emitAppEvent({
          orgId: params.orgId,
          eventType: 'job.started',
          payload: payloadBase,
          actorUserId: params.event.actorUserId ?? null,
        });
      }

      if (after.status === 'completed') {
        const materialsResult = await listJobMaterialAllocations({ orgId: params.orgId, jobId: after.id });
        const materials = materialsResult.ok
          ? materialsResult.data.map((m) => ({ materialId: m.materialId, quantity: m.plannedQuantity }))
          : [];
        void emitAppEvent({
          orgId: params.orgId,
          eventType: 'job.completed',
          payload: { ...payloadBase, materials },
          actorUserId: params.event.actorUserId ?? null,
        });
      }
    }

    if (progressChanged) {
      const progressMap: Record<string, number> = {
        not_started: 0,
        in_progress: 25,
        half_complete: 50,
        completed: 100,
      };
      const progressPercent = progressMap[after.progressStatus ?? 'not_started'] ?? 0;
      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job.progress.updated',
        payload: { ...payloadBase, progressStatus: after.progressStatus, progressPercent },
        actorUserId: params.event.actorUserId ?? null,
      });
    }

    return { ok: true, retryable: false };
  }

  if (params.action.type === 'schedule.update') {
    const existing = await getScheduleAssignmentById(params.action.params.assignmentId, params.orgId);
    if (!existing.ok) {
      return { ok: false, retryable: false, error: existing.error.message };
    }

    const date = params.action.params.date ? new Date(params.action.params.date) : existing.data.date;
    const crewIdResolved = params.action.params.crewId ?? existing.data.crewId;
    const startMinutes = params.action.params.startMinutes ?? existing.data.startMinutes;
    const endMinutes = params.action.params.endMinutes ?? existing.data.endMinutes;
    const duration = endMinutes - startMinutes;
    if (duration <= 0) {
      return { ok: false, retryable: false, error: 'Invalid schedule duration' };
    }

    const dayAssignmentsResult = await listScheduleAssignmentsByDate(params.orgId, date);
    if (!dayAssignmentsResult.ok) {
      return { ok: false, retryable: true, error: dayAssignmentsResult.error.message };
    }
    const crewAssignments = dayAssignmentsResult.data.filter((row) => row.crewId === crewIdResolved && row.id !== existing.data.id);
    const travelMinutes = 30;
    const travelDurations = new Map<string, number>();
    for (let i = 0; i < crewAssignments.length - 1; i++) {
      travelDurations.set(`${crewAssignments[i].id}:${crewAssignments[i + 1].id}`, travelMinutes);
    }
    const occupiedTimeline = buildOccupiedTimeline(
      crewAssignments.map((row) => ({
        id: row.id,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
      })),
      travelDurations
    );
    const placement = resolvePlacement({
      desiredStartMinutes: startMinutes,
      durationMinutes: duration,
      occupiedTimeline,
      workdayEndMinutes: 720,
    });
    if (placement.startMinutes === null || placement.startMinutes !== startMinutes) {
      return { ok: false, retryable: false, error: `Schedule placement invalid (${placement.snapReason ?? 'overlap'})` };
    }

    const assignmentStatus =
      typeof params.action.params.status === 'string' &&
      ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(params.action.params.status)
        ? (params.action.params.status as UpdateScheduleAssignmentInput['status'])
        : existing.data.status;

    const updateResult = await updateScheduleAssignment({
      id: existing.data.id,
      orgId: params.orgId,
      crewId: crewIdResolved,
      date: date.toISOString(),
      startMinutes,
      endMinutes,
      assignmentType: params.action.params.assignmentType ?? existing.data.assignmentType,
      status: assignmentStatus,
    });
    if (!updateResult.ok) {
      return { ok: false, retryable: false, error: updateResult.error.message };
    }

    const payloadBase = {
      assignmentId: updateResult.data.id,
      jobId: updateResult.data.jobId,
      crewId: updateResult.data.crewId,
      date: updateResult.data.date ? updateResult.data.date.toISOString() : undefined,
      startMinutes: updateResult.data.startMinutes,
      endMinutes: updateResult.data.endMinutes,
      assignmentType: updateResult.data.assignmentType,
      status: updateResult.data.status,
      ...automationMeta,
    };
    void emitAppEvent({
      orgId: params.orgId,
      eventType: 'schedule.updated',
      payload: payloadBase,
      actorUserId: params.event.actorUserId ?? null,
    });

    const crewChanged = existing.data.crewId !== updateResult.data.crewId;
    const timeChanged =
      existing.data.startMinutes !== updateResult.data.startMinutes ||
      existing.data.endMinutes !== updateResult.data.endMinutes ||
      existing.data.assignmentType !== updateResult.data.assignmentType ||
      existing.data.date?.toISOString?.() !== updateResult.data.date?.toISOString?.();

    if (crewChanged) {
      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job.unassigned',
        payload: {
          assignmentId: existing.data.id,
          jobId: existing.data.jobId,
          crewId: existing.data.crewId,
          date: existing.data.date ? existing.data.date.toISOString() : undefined,
          startMinutes: existing.data.startMinutes,
          endMinutes: existing.data.endMinutes,
          assignmentType: existing.data.assignmentType,
          status: existing.data.status,
          ...automationMeta,
        },
        actorUserId: params.event.actorUserId ?? null,
      });
      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job.assigned',
        payload: payloadBase,
        actorUserId: params.event.actorUserId ?? null,
      });
    } else if (timeChanged) {
      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job.rescheduled',
        payload: payloadBase,
        actorUserId: params.event.actorUserId ?? null,
      });
    }

    return { ok: true, retryable: false };
  }

  if (params.action.type === 'schedule.create') {
    const action = params.action as AutomationActionScheduleCreate;
    const date = new Date(action.params.date);
    const duration = action.params.endMinutes - action.params.startMinutes;
    if (duration <= 0) {
      return { ok: false, retryable: false, error: 'Invalid schedule duration' };
    }

    const dayAssignmentsResult = await listScheduleAssignmentsByDate(params.orgId, date);
    if (!dayAssignmentsResult.ok) {
      return { ok: false, retryable: true, error: dayAssignmentsResult.error.message };
    }
    const crewAssignments = dayAssignmentsResult.data.filter((row) => row.crewId === action.params.crewId);
    const travelMinutes = 30;
    const travelDurations = new Map<string, number>();
    for (let i = 0; i < crewAssignments.length - 1; i++) {
      travelDurations.set(`${crewAssignments[i].id}:${crewAssignments[i + 1].id}`, travelMinutes);
    }
    const occupiedTimeline = buildOccupiedTimeline(
      crewAssignments.map((row) => ({
        id: row.id,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
      })),
      travelDurations
    );
    const placement = resolvePlacement({
      desiredStartMinutes: action.params.startMinutes,
      durationMinutes: duration,
      occupiedTimeline,
      workdayEndMinutes: 720,
    });
    if (placement.startMinutes === null || placement.startMinutes !== action.params.startMinutes) {
      return { ok: false, retryable: false, error: `Schedule placement invalid (${placement.snapReason ?? 'overlap'})` };
    }

    const createResult = await createScheduleAssignment({
      orgId: params.orgId,
      jobId: action.params.jobId,
      crewId: action.params.crewId,
      date: action.params.date,
      startMinutes: action.params.startMinutes,
      endMinutes: action.params.endMinutes,
      assignmentType: action.params.assignmentType ?? 'install',
      status:
        typeof action.params.status === 'string' &&
        ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(action.params.status)
          ? (action.params.status as CreateScheduleAssignmentInput['status'])
          : 'scheduled',
      startAtHq: false,
      endAtHq: false,
    });
    if (!createResult.ok) {
      return { ok: false, retryable: false, error: createResult.error.message };
    }

    const payloadBase = {
      assignmentId: createResult.data.id,
      jobId: createResult.data.jobId,
      crewId: createResult.data.crewId,
      date: createResult.data.date ? createResult.data.date.toISOString() : undefined,
      startMinutes: createResult.data.startMinutes,
      endMinutes: createResult.data.endMinutes,
      assignmentType: createResult.data.assignmentType,
      status: createResult.data.status,
      ...automationMeta,
    };
    void emitAppEvent({
      orgId: params.orgId,
      eventType: 'schedule.updated',
      payload: payloadBase,
      actorUserId: params.event.actorUserId ?? null,
    });
    void emitAppEvent({
      orgId: params.orgId,
      eventType: 'job.assigned',
      payload: payloadBase,
      actorUserId: params.event.actorUserId ?? null,
    });

    return { ok: true, retryable: false };
  }

  if (params.action.type === 'materials.adjust') {
    const result = await createMaterialInventoryEvent({
      orgId: params.orgId,
      materialId: params.action.params.materialId,
      quantity: params.action.params.quantity,
      reason: params.action.params.reason ?? null,
      eventType: params.action.params.eventType ?? 'manual_adjustment',
      jobId: params.action.params.jobId ?? null,
    });
    if (!result.ok) {
      return { ok: false, retryable: false, error: result.error.message };
    }
    void emitAppEvent({
      orgId: params.orgId,
      eventType: 'material.stock.updated',
      payload: {
        materialId: params.action.params.materialId,
        quantity: params.action.params.quantity,
        ...automationMeta,
      },
      actorUserId: params.event.actorUserId ?? null,
    });
    return { ok: true, retryable: false };
  }

  if (params.action.type === 'task.create') {
    const resolvedJobId = params.action.params.jobId ?? jobId;
    if (!resolvedJobId) {
      return { ok: false, retryable: false, error: 'Job ID is required' };
    }
    const result = await createTask({
      orgId: params.orgId,
      jobId: resolvedJobId,
      title: params.action.params.title,
      description: params.action.params.description ?? null,
      status: 'pending',
      isRequired: params.action.params.isRequired ?? true,
      order: params.action.params.order ?? 0,
    });
    if (!result.ok) {
      return { ok: false, retryable: false, error: result.error.message };
    }
    return { ok: true, retryable: false };
  }

  if (params.action.type === 'webhook.call' || params.action.type === 'invoice.draft' || params.action.type === 'integration.emit') {
    return { ok: false, retryable: false, error: 'Action type not implemented yet' };
  }

  return { ok: false, retryable: false, error: 'Unsupported action type' };
}

async function updateRunStatus(params: { db: DbClient; runId: string }) {
  const actions = await params.db
    .select({
      status: automationActionsOutbox.status,
    })
    .from(automationActionsOutbox)
    .where(eq(automationActionsOutbox.runId, params.runId));

  if (actions.length === 0) return;
  const statuses = actions.map((row) => row.status);
  const anyPending = statuses.some((status) => status === 'queued' || status === 'retrying');
  const anyFailed = statuses.some((status) => status === 'failed' || status === 'dead');
  const anySent = statuses.some((status) => status === 'sent');

  let runStatus: 'queued' | 'running' | 'success' | 'partial' | 'failed' = 'queued';
  if (anyPending) runStatus = 'running';
  else if (anyFailed && anySent) runStatus = 'partial';
  else if (anyFailed && !anySent) runStatus = 'failed';
  else runStatus = 'success';

  await params.db
    .update(automationRuns)
    .set({
      status: runStatus,
      finishedAt: anyPending ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(automationRuns.id, params.runId));
}

/**
 * Dispatches due automation actions.
 */
export async function dispatchAutomationActions(params: {
  orgId: string;
  limit?: number;
}): Promise<{ processed: number }> {
  const limit = params.limit ?? AUTOMATIONS_DISPATCH_BATCH;
  const now = new Date();

  return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
    const rows = await db
      .select()
      .from(automationActionsOutbox)
      .where(
        and(
          eq(automationActionsOutbox.orgId, params.orgId),
          inArray(automationActionsOutbox.status, ['queued', 'retrying']),
          or(isNull(automationActionsOutbox.nextAttemptAt), lte(automationActionsOutbox.nextAttemptAt, now))
        )
      )
      .orderBy(asc(automationActionsOutbox.nextAttemptAt), asc(automationActionsOutbox.createdAt))
      .limit(limit);

    let processed = 0;

    for (const row of rows) {
      const attempt = (row.attempts ?? 0) + 1;
      await db
        .update(automationActionsOutbox)
        .set({ status: 'retrying', attempts: attempt, updatedAt: now })
        .where(eq(automationActionsOutbox.id, row.id));

      const [eventRow] = await db
        .select()
        .from(appEvents)
        .where(eq(appEvents.id, row.eventId))
        .limit(1);
      if (!eventRow) {
        await db
          .update(automationActionsOutbox)
          .set({ status: 'failed', lastError: 'Event not found', updatedAt: new Date() })
          .where(eq(automationActionsOutbox.id, row.id));
        continue;
      }

      const parsed = automationActionSchema.safeParse(row.actionPayload);
      if (!parsed.success) {
        await db
          .update(automationActionsOutbox)
          .set({ status: 'failed', lastError: 'Invalid action payload', updatedAt: new Date() })
          .where(eq(automationActionsOutbox.id, row.id));
        continue;
      }

      if (parsed.data.type === 'comms.send' && row.providerMessageId) {
        await db
          .update(automationActionsOutbox)
          .set({ status: 'sent', updatedAt: new Date() })
          .where(eq(automationActionsOutbox.id, row.id));
        await updateRunStatus({ db, runId: row.runId });
        processed += 1;
        continue;
      }

      const context = await resolveAutomationContext({ db, orgId: params.orgId, event: eventRow });
      const result = await executeAction({
        orgId: params.orgId,
        action: parsed.data as AutomationActionNode,
        event: eventRow,
        context,
        outboxId: row.id,
      });

      if (result.ok) {
        await db
          .update(automationActionsOutbox)
          .set({
            status: 'sent',
            lastError: null,
            providerMessageId: result.providerMessageId ?? row.providerMessageId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(automationActionsOutbox.id, row.id));
      } else if (!result.retryable || attempt >= MAX_ATTEMPTS) {
        await db
          .update(automationActionsOutbox)
          .set({
            status: attempt >= MAX_ATTEMPTS ? 'dead' : 'failed',
            lastError: result.error ?? 'Action failed',
            updatedAt: new Date(),
          })
          .where(eq(automationActionsOutbox.id, row.id));
      } else {
        await db
          .update(automationActionsOutbox)
          .set({
            status: 'retrying',
            lastError: result.error ?? 'Action failed',
            nextAttemptAt: buildBackoff(attempt),
            updatedAt: new Date(),
          })
          .where(eq(automationActionsOutbox.id, row.id));
      }

      await updateRunStatus({ db, runId: row.runId });
      processed += 1;
    }

    return { processed };
  });
}
