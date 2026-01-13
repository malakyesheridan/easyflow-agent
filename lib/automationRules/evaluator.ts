import { and, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import type { AppEvent } from '@/db/schema/app_events';
import { jobPayments } from '@/db/schema/job_payments';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobTypes } from '@/db/schema/job_types';
import { jobPhotos } from '@/db/schema/job_photos';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { materialAlerts } from '@/db/schema/material_alerts';
import { jobs } from '@/db/schema/jobs';
import { getDb } from '@/lib/db';
import { resolveAutomationContext } from '@/lib/automations/context';
import { getConditionDefinition } from './conditionsRegistry';
import type { RuleCondition, TriggerKey } from './types';

export type RuleEvaluation = {
  matched: boolean;
  matchDetails: {
    conditions: Array<{ condition: RuleCondition; passed: boolean; evaluatedValue: unknown }>;
  };
  context: Awaited<ReturnType<typeof resolveAutomationContext>>;
  paymentStatus: 'paid' | 'unpaid' | 'overdue' | null;
  error?: string;
};

type DbClient = ReturnType<typeof getDb>;

type RuleEvent = Pick<AppEvent, 'id' | 'orgId' | 'eventType' | 'payload' | 'createdAt' | 'actorUserId'>;

function mapProgressStatus(status: string | null | undefined): number {
  const map: Record<string, number> = {
    not_started: 0,
    in_progress: 25,
    half_complete: 50,
    completed: 100,
  };
  if (!status) return 0;
  return map[status] ?? 0;
}

function resolveProgressPercent(payload: Record<string, unknown>, context: Awaited<ReturnType<typeof resolveAutomationContext>>): number {
  const percent = typeof (payload as any).progressPercent === 'number' ? (payload as any).progressPercent : null;
  if (percent !== null) return Math.max(0, Math.min(100, percent));
  const status = typeof (context.job as any)?.progressStatus === 'string' ? String((context.job as any).progressStatus) : null;
  return mapProgressStatus(status);
}

function resolveScheduledStart(
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof resolveAutomationContext>>
): Date | null {
  const computed = context.computed as Record<string, any> | null;
  const computedStart = computed?.scheduleStartAt ? new Date(computed.scheduleStartAt) : null;
  if (computedStart && !Number.isNaN(computedStart.getTime())) return computedStart;
  const rawStart = (context.job as any)?.scheduledStart ?? null;
  if (rawStart instanceof Date) return rawStart;
  if (typeof rawStart === 'string') {
    const parsed = new Date(rawStart);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const dateStr = typeof payload.date === 'string' ? payload.date : null;
  if (dateStr && typeof (payload as any).startMinutes === 'number') {
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setMinutes(parsed.getMinutes() + (payload as any).startMinutes);
      return parsed;
    }
  }
  return null;
}

function resolveLocalHour(now: Date, timeZone: string | null | undefined): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: timeZone || 'UTC' });
    const hourStr = formatter.format(now);
    const hour = Number(hourStr);
    return Number.isFinite(hour) ? hour : now.getHours();
  } catch {
    return now.getHours();
  }
}

async function loadPaymentRow(
  db: DbClient,
  orgId: string,
  paymentId: string | null,
  jobId: string | null
): Promise<{ status: string; amountCents: number | null } | null> {
  let row = null as null | { status: string; amountCents: number | null };

  if (paymentId) {
    [row] = await db
      .select({ status: jobPayments.status, amountCents: jobPayments.amountCents })
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, orgId), eq(jobPayments.id, paymentId)))
      .limit(1);
  }

  if (!row && jobId) {
    [row] = await db
      .select({ status: jobPayments.status, amountCents: jobPayments.amountCents })
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, orgId), eq(jobPayments.jobId, jobId)))
      .orderBy(desc(jobPayments.createdAt))
      .limit(1);
  }

  return row ?? null;
}

async function loadInvoiceRow(
  db: DbClient,
  orgId: string,
  invoiceId: string | null,
  jobId: string | null
): Promise<{ status: string; amountCents: number | null; totalCents: number | null; sentAt: Date | null; paidAt: Date | null; dueAt: Date | null } | null> {
  let row = null as null | { status: string; amountCents: number | null; totalCents: number | null; sentAt: Date | null; paidAt: Date | null; dueAt: Date | null };

  if (invoiceId) {
    [row] = await db
      .select({
        status: jobInvoices.status,
        amountCents: jobInvoices.amountCents,
        totalCents: jobInvoices.totalCents,
        sentAt: jobInvoices.sentAt,
        paidAt: jobInvoices.paidAt,
        dueAt: jobInvoices.dueAt,
      })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, orgId), eq(jobInvoices.id, invoiceId)))
      .limit(1);
  }

  if (!row && jobId) {
    [row] = await db
      .select({
        status: jobInvoices.status,
        amountCents: jobInvoices.amountCents,
        totalCents: jobInvoices.totalCents,
        sentAt: jobInvoices.sentAt,
        paidAt: jobInvoices.paidAt,
        dueAt: jobInvoices.dueAt,
      })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, orgId), eq(jobInvoices.jobId, jobId)))
      .orderBy(desc(jobInvoices.createdAt))
      .limit(1);
  }

  return row ?? null;
}

async function loadJobTypeKey(db: DbClient, orgId: string, jobTypeId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: jobTypes.key })
    .from(jobTypes)
    .where(and(eq(jobTypes.orgId, orgId), eq(jobTypes.id, jobTypeId)))
    .limit(1);
  return typeof row?.key === 'string' ? row.key : null;
}

async function loadJobPhotoCount(db: DbClient, orgId: string, jobId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(jobPhotos)
    .where(and(eq(jobPhotos.orgId, orgId), eq(jobPhotos.jobId, jobId)));
  return Number(row?.count ?? 0);
}

async function loadLatestJobNote(db: DbClient, orgId: string, jobId: string): Promise<string | null> {
  const [row] = await db
    .select({ payload: jobActivityEvents.payload })
    .from(jobActivityEvents)
    .where(and(eq(jobActivityEvents.orgId, orgId), eq(jobActivityEvents.jobId, jobId), eq(jobActivityEvents.type, 'note_added')))
    .orderBy(desc(jobActivityEvents.createdAt))
    .limit(1);

  const payload = (row?.payload ?? {}) as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message : null;
  return message;
}

async function loadOverdueJobsExist(db: DbClient, orgId: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), lt(jobs.scheduledEnd, now), ne(jobs.status, 'completed')))
    .limit(1);
  return Boolean(row?.id);
}

async function loadLowStockExists(db: DbClient, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: materialAlerts.id })
    .from(materialAlerts)
    .where(and(eq(materialAlerts.orgId, orgId), eq(materialAlerts.type, 'low_stock'), isNull(materialAlerts.resolvedAt)))
    .limit(1);
  return Boolean(row?.id);
}

function normalizePaymentStatus(status: string | null | undefined): 'paid' | 'unpaid' | 'overdue' | null {
  if (!status) return null;
  const lowered = status.toLowerCase();
  if (lowered === 'paid' || lowered === 'succeeded') return 'paid';
  if (lowered === 'overdue') return 'overdue';
  return 'unpaid';
}

export async function evaluateRuleConditions(params: {
  db: DbClient;
  orgId: string;
  triggerKey: TriggerKey;
  conditions: RuleCondition[];
  event: RuleEvent;
}): Promise<RuleEvaluation> {
  const payload = (params.event.payload ?? {}) as Record<string, unknown>;
  const context = await resolveAutomationContext({ db: params.db, orgId: params.orgId, event: params.event });
  const now = new Date();

  const jobId =
    typeof payload.jobId === 'string'
      ? payload.jobId
      : typeof (context.job as any)?.id === 'string'
        ? String((context.job as any).id)
        : null;
  const paymentId = typeof (payload as any).paymentId === 'string' ? String((payload as any).paymentId) : null;
  const invoiceId = typeof (payload as any).invoiceId === 'string' ? String((payload as any).invoiceId) : null;

  let jobTypeKey: string | null | undefined;
  let paymentRow: { status: string; amountCents: number | null } | null | undefined;
  let invoiceRow: {
    status: string;
    amountCents: number | null;
    totalCents: number | null;
    sentAt: Date | null;
    paidAt: Date | null;
    dueAt: Date | null;
  } | null | undefined;
  let jobPhotoCount: number | null | undefined;
  let latestJobNote: string | null | undefined;
  let overdueExists: boolean | undefined;
  let lowStockExists: boolean | undefined;

  const conditionResults: Array<{ condition: RuleCondition; passed: boolean; evaluatedValue: unknown }> = [];
  let evaluationError: string | undefined;

  for (const condition of params.conditions) {
    const definition = getConditionDefinition(condition.key);
    if (!definition) {
      evaluationError = 'Condition context missing';
      console.error('Condition context missing', { triggerKey: params.triggerKey, condition: condition.key });
      conditionResults.push({ condition, passed: false, evaluatedValue: null });
      break;
    }

    if (definition.requiresJobContext && !context.job) {
      evaluationError = 'Condition context missing';
      console.error('Condition context missing', { triggerKey: params.triggerKey, condition: condition.key });
      conditionResults.push({ condition, passed: false, evaluatedValue: null });
      break;
    }

    if (definition.requiresMaterialContext && !context.material) {
      evaluationError = 'Condition context missing';
      console.error('Condition context missing', { triggerKey: params.triggerKey, condition: condition.key });
      conditionResults.push({ condition, passed: false, evaluatedValue: null });
      break;
    }

    if (definition.requiresBillingContext && !jobId && !paymentId && !invoiceId) {
      evaluationError = 'Condition context missing';
      console.error('Condition context missing', { triggerKey: params.triggerKey, condition: condition.key });
      conditionResults.push({ condition, passed: false, evaluatedValue: null });
      break;
    }

    let passed = false;
    let evaluated: unknown = null;
    let missingContext = false;

    switch (condition.key) {
      case 'job.type_equals': {
        const jobTypeId =
          typeof (context.job as any)?.jobTypeId === 'string'
            ? String((context.job as any).jobTypeId)
            : typeof (payload as any).jobTypeId === 'string'
              ? String((payload as any).jobTypeId)
              : null;
        if (!jobTypeId) {
          missingContext = true;
          break;
        }
        if (jobTypeKey === undefined) {
          jobTypeKey = await loadJobTypeKey(params.db, params.orgId, jobTypeId);
        }
        evaluated = jobTypeKey;
        passed = jobTypeKey === condition.value;
        break;
      }
      case 'job.priority_equals': {
        const priority = typeof (context.job as any)?.priority === 'string' ? String((context.job as any).priority) : null;
        if (!priority) {
          missingContext = true;
          break;
        }
        evaluated = priority;
        passed = priority === condition.value;
        break;
      }
      case 'job.has_tag': {
        const tags = (context.job as any)?.tags;
        if (!Array.isArray(tags)) {
          missingContext = true;
          break;
        }
        evaluated = tags;
        passed = tags.includes(condition.value);
        break;
      }
      case 'job.is_assigned': {
        const crewId =
          typeof (context.assignment as any)?.crewId === 'string'
            ? (context.assignment as any).crewId
            : typeof (context.job as any)?.crewId === 'string'
              ? (context.job as any).crewId
              : typeof payload.crewId === 'string'
                ? payload.crewId
                : null;
        evaluated = Boolean(crewId);
        passed = evaluated === condition.value;
        break;
      }
      case 'job.assigned_to_crew': {
        const crewId =
          typeof (context.assignment as any)?.crewId === 'string'
            ? (context.assignment as any).crewId
            : typeof (context.job as any)?.crewId === 'string'
              ? (context.job as any).crewId
              : typeof payload.crewId === 'string'
                ? payload.crewId
                : null;
        evaluated = crewId;
        passed = crewId === condition.value;
        break;
      }
      case 'job.assigned_to_any': {
        const crewId =
          typeof (context.assignment as any)?.crewId === 'string'
            ? (context.assignment as any).crewId
            : typeof (context.job as any)?.crewId === 'string'
              ? (context.job as any).crewId
              : typeof payload.crewId === 'string'
                ? payload.crewId
                : null;
        evaluated = Boolean(crewId);
        passed = evaluated === condition.value;
        break;
      }
      case 'job.scheduled_within_hours':
      case 'job.rescheduled_within_hours': {
        const start = resolveScheduledStart(payload, context);
        evaluated = start ? start.toISOString() : null;
        if (!start) {
          missingContext = true;
          break;
        }
        const diffMs = start.getTime() - now.getTime();
        const diffHours = diffMs / (60 * 60 * 1000);
        passed = diffHours >= 0 && diffHours <= Number(condition.value);
        break;
      }
      case 'job.new_status_equals': {
        const status =
          typeof payload.status === 'string'
            ? payload.status
            : typeof (context.job as any)?.status === 'string'
              ? String((context.job as any).status)
              : null;
        if (!status) {
          missingContext = true;
          break;
        }
        evaluated = status;
        passed = status === condition.value;
        break;
      }
      case 'job.previous_status_equals': {
        const prev =
          typeof (payload as any).previousStatus === 'string'
            ? String((payload as any).previousStatus)
            : typeof (payload as any).previous_status === 'string'
              ? String((payload as any).previous_status)
              : null;
        if (!prev) {
          missingContext = true;
          break;
        }
        evaluated = prev;
        passed = prev === condition.value;
        break;
      }
      case 'job.progress_gte':
      case 'job.progress_lte': {
        const hasProgressValue =
          typeof (payload as any).progressPercent === 'number' || typeof (context.job as any)?.progressStatus === 'string';
        if (!hasProgressValue) {
          missingContext = true;
          break;
        }
        evaluated = resolveProgressPercent(payload, context);
        passed =
          condition.key === 'job.progress_gte'
            ? typeof evaluated === 'number' && evaluated >= Number(condition.value)
            : typeof evaluated === 'number' && evaluated <= Number(condition.value);
        break;
      }
      case 'job.was_paid': {
        if (paymentRow === undefined) {
          paymentRow = await loadPaymentRow(params.db, params.orgId, paymentId, jobId);
        }
        const status = normalizePaymentStatus(paymentRow?.status ?? null);
        const isPaid = status === 'paid';
        evaluated = status;
        passed = isPaid === Boolean(condition.value);
        break;
      }
      case 'job.photo_count_gte': {
        if (!jobId) {
          missingContext = true;
          break;
        }
        if (jobPhotoCount === undefined) {
          jobPhotoCount = await loadJobPhotoCount(params.db, params.orgId, jobId);
        }
        evaluated = jobPhotoCount;
        passed = typeof jobPhotoCount === 'number' && jobPhotoCount >= Number(condition.value);
        break;
      }
      case 'job.note_contains': {
        if (!jobId) {
          missingContext = true;
          break;
        }
        if (latestJobNote === undefined) {
          latestJobNote = await loadLatestJobNote(params.db, params.orgId, jobId);
        }
        evaluated = latestJobNote;
        if (!latestJobNote || typeof condition.value !== 'string') {
          passed = false;
          break;
        }
        passed = latestJobNote.toLowerCase().includes(condition.value.toLowerCase());
        break;
      }
      case 'material.stock_below': {
        const computed = context.computed as Record<string, any> | null;
        const current =
          typeof computed?.materialAvailable === 'number'
            ? computed.materialAvailable
            : typeof computed?.materialCurrentStock === 'number'
              ? computed.materialCurrentStock
              : null;
        if (typeof current !== 'number') {
          missingContext = true;
          break;
        }
        evaluated = current;
        passed = current < Number(condition.value);
        break;
      }
      case 'material.category_equals': {
        const category = (context.material as any)?.category;
        if (!context.material) {
          missingContext = true;
          break;
        }
        evaluated = category ?? null;
        passed = typeof category === 'string' && category === condition.value;
        break;
      }
      case 'material.is_critical': {
        const computed = context.computed as Record<string, any> | null;
        const current = typeof computed?.materialAvailable === 'number' ? computed.materialAvailable : null;
        if (typeof current !== 'number') {
          missingContext = true;
          break;
        }
        evaluated = current <= 0;
        passed = evaluated === condition.value;
        break;
      }
      case 'material.stock_delta_gte': {
        const delta = typeof payload.quantity === 'number' ? payload.quantity : null;
        if (typeof delta !== 'number') {
          missingContext = true;
          break;
        }
        evaluated = delta;
        passed = delta >= Number(condition.value);
        break;
      }
      case 'invoice.total_gte': {
        const amount =
          typeof (payload as any).amountCents === 'number'
            ? (payload as any).amountCents
            : typeof (payload as any).total === 'number'
              ? (payload as any).total
              : null;
        if (amount === null) {
          if (invoiceRow === undefined) {
            invoiceRow = await loadInvoiceRow(params.db, params.orgId, invoiceId, jobId);
          }
          const invoiceTotal = typeof invoiceRow?.totalCents === 'number' ? invoiceRow.totalCents : invoiceRow?.amountCents;
          if (typeof invoiceTotal !== 'number') {
            missingContext = true;
            break;
          }
          evaluated = invoiceTotal;
          passed = invoiceTotal >= Number(condition.value);
          break;
        }
        evaluated = amount;
        passed = amount >= Number(condition.value);
        break;
      }
      case 'invoice.is_overdue': {
        const overdue =
          typeof (payload as any).isOverdue === 'boolean'
            ? (payload as any).isOverdue
            : typeof (payload as any).overdue === 'boolean'
              ? (payload as any).overdue
              : null;
        if (overdue !== null) {
          evaluated = overdue;
          passed = overdue === condition.value;
          break;
        }
        if (invoiceRow === undefined) {
          invoiceRow = await loadInvoiceRow(params.db, params.orgId, invoiceId, jobId);
        }
        if (!invoiceRow?.status) {
          missingContext = true;
          break;
        }
        const status = String(invoiceRow.status).toLowerCase();
        const dueAt = invoiceRow.dueAt ?? null;
        if (!dueAt) {
          evaluated = false;
          passed = evaluated === Boolean(condition.value);
          break;
        }
        const isOverdue = dueAt.getTime() < now.getTime() && status !== 'paid' && status !== 'void';
        evaluated = isOverdue;
        passed = isOverdue === Boolean(condition.value);
        break;
      }
      case 'invoice.customer_type_equals': {
        const customerType =
          typeof (payload as any).customerType === 'string'
            ? String((payload as any).customerType)
            : typeof (payload as any).customer_type === 'string'
              ? String((payload as any).customer_type)
              : null;
        if (!customerType) {
          missingContext = true;
          break;
        }
        evaluated = customerType;
        passed = customerType === condition.value;
        break;
      }
      case 'payment.amount_gte': {
        const amount =
          typeof (payload as any).amountCents === 'number'
            ? (payload as any).amountCents
            : typeof (payload as any).amount === 'number'
              ? (payload as any).amount
              : null;
        if (amount === null) {
          if (paymentRow === undefined) {
            paymentRow = await loadPaymentRow(params.db, params.orgId, paymentId, jobId);
          }
          if (typeof paymentRow?.amountCents !== 'number') {
            missingContext = true;
            break;
          }
          evaluated = paymentRow.amountCents;
          passed = paymentRow.amountCents >= Number(condition.value);
          break;
        }
        evaluated = amount;
        passed = amount >= Number(condition.value);
        break;
      }
      case 'payment.method_equals': {
        const method =
          typeof (payload as any).method === 'string'
            ? String((payload as any).method)
            : typeof (payload as any).paymentMethod === 'string'
              ? String((payload as any).paymentMethod)
              : typeof (payload as any).payment_method === 'string'
                ? String((payload as any).payment_method)
                : null;
        if (!method) {
          missingContext = true;
          break;
        }
        evaluated = method;
        passed = method === condition.value;
        break;
      }
      case 'invoice.is_fully_paid': {
        const isFullyPaid =
          typeof (payload as any).isFullyPaid === 'boolean'
            ? (payload as any).isFullyPaid
            : typeof (payload as any).is_fully_paid === 'boolean'
              ? (payload as any).is_fully_paid
              : typeof (payload as any).paid === 'boolean'
                ? (payload as any).paid
                : null;
        if (isFullyPaid !== null) {
          evaluated = isFullyPaid;
          passed = isFullyPaid === condition.value;
          break;
        }
        if (invoiceRow === undefined) {
          invoiceRow = await loadInvoiceRow(params.db, params.orgId, invoiceId, jobId);
        }
        if (!invoiceRow) {
          missingContext = true;
          break;
        }
        evaluated = Boolean(invoiceRow.paidAt || String(invoiceRow.status).toLowerCase() === 'paid');
        passed = evaluated === condition.value;
        break;
      }
      case 'time.local_hour_equals': {
        const timeZone = (context.org.settings as any)?.timezone ?? null;
        evaluated = resolveLocalHour(now, timeZone);
        passed = evaluated === condition.value;
        break;
      }
      case 'job.overdue_exists': {
        if (overdueExists === undefined) {
          overdueExists = await loadOverdueJobsExist(params.db, params.orgId, now);
        }
        evaluated = overdueExists;
        passed = overdueExists === condition.value;
        break;
      }
      case 'material.stock_low_exists': {
        if (lowStockExists === undefined) {
          lowStockExists = await loadLowStockExists(params.db, params.orgId);
        }
        evaluated = lowStockExists;
        passed = lowStockExists === condition.value;
        break;
      }
      default:
        missingContext = true;
    }

    if (missingContext) {
      evaluationError = 'Condition context missing';
      console.error('Condition context missing', { triggerKey: params.triggerKey, condition: condition.key });
      conditionResults.push({ condition, passed: false, evaluatedValue: evaluated });
      break;
    }

    conditionResults.push({ condition, passed, evaluatedValue: evaluated });
  }

  const matched = conditionResults.every((result) => result.passed) && !evaluationError;

  const paymentStatus = paymentRow ? normalizePaymentStatus(paymentRow.status) : null;

  return {
    matched,
    matchDetails: { conditions: conditionResults },
    context,
    paymentStatus,
    error: evaluationError,
  };
}
