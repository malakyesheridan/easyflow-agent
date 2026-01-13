import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().datetime().optional();

const jobBase = z
  .object({
    jobId: uuid,
    status: z.string().optional(),
    crewId: uuid.nullable().optional(),
    jobTypeId: uuid.nullable().optional(),
  })
  .passthrough();

const scheduleBase = z
  .object({
    assignmentId: uuid,
    jobId: uuid,
    crewId: uuid,
    date: isoDate,
    startMinutes: z.number().int().optional(),
    endMinutes: z.number().int().optional(),
    assignmentType: z.string().optional(),
  })
  .passthrough();

const materialBase = z
  .object({
    materialId: uuid,
    jobId: uuid.optional(),
    quantity: z.number().optional(),
  })
  .passthrough();

const paymentBase = z
  .object({
    jobId: uuid.optional(),
    amountCents: z.number().int().optional(),
    currency: z.string().optional(),
  })
  .passthrough();

const jobMarginBase = jobBase.extend({
  marginPercent: z.number().optional(),
  profitCents: z.number().int().optional(),
  revenueCents: z.number().int().optional(),
  costCents: z.number().int().optional(),
  thresholdPercent: z.number().optional(),
  status: z.string().optional(),
});

const jobVarianceBase = jobBase.extend({
  costVariancePercent: z.number().optional(),
  estimatedCostCents: z.number().int().optional(),
  costCents: z.number().int().optional(),
  thresholdPercent: z.number().optional(),
});

export const appEventSchemas = {
  'job.created': jobBase,
  'job.assigned': scheduleBase,
  'job.unassigned': scheduleBase,
  'job.started': jobBase,
  'job.completed': jobBase,
  'job.cancelled': jobBase,
  'job.rescheduled': scheduleBase,
  'job.materials.updated': jobBase,
  'job.photos.added': jobBase,
  'job.notes.updated': jobBase,
  'job.status.updated': jobBase,
  'job.progress.updated': jobBase,
  'job_margin_warning': jobMarginBase,
  'job_margin_critical': jobMarginBase,
  'job_cost_variance_exceeded': jobVarianceBase,
  'schedule.updated': scheduleBase,
  'schedule.conflict_detected': scheduleBase,
  'schedule.overdue_detected': scheduleBase,
  'material.stock.low': materialBase,
  'material.stock.updated': materialBase,
  'material.usage.recorded': materialBase,
  'crew.job.completed': jobBase,
  'crew.performance.updated': z.object({ crewId: uuid }).passthrough(),
  'crew.overutilised': z.object({ crewId: uuid }).passthrough(),
  'payment.link.created': paymentBase,
  'payment.received': paymentBase,
  'payment.recorded': paymentBase,
  'invoice.created': paymentBase,
  'invoice.sent': paymentBase,
  'invoice.issued': paymentBase,
  'invoice.paid': paymentBase,
  'invoice.overdue': paymentBase,
} as const;

export type AppEventType = keyof typeof appEventSchemas;
export type AppEventPayload<T extends AppEventType> = z.infer<(typeof appEventSchemas)[T]>;

export function validateAppEventPayload<T extends AppEventType>(
  eventType: T,
  payload: unknown
): AppEventPayload<T> {
  return appEventSchemas[eventType].parse(payload) as AppEventPayload<T>;
}
