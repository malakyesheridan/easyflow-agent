import { z } from 'zod';

const uuidSchema = z.string().uuid();

const conditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.boolean()),
]);

const conditionOperandSchema = z.union([
  conditionValueSchema,
  z.object({ ref: z.string().min(1) }),
  z.object({ value: conditionValueSchema }),
]);

const compareConditionSchema = z.object({
  left: conditionOperandSchema,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists']),
  right: conditionOperandSchema,
});

const timeConditionSchema = z.object({
  op: z.enum(['within_hours', 'outside_business_hours', 'before', 'after']),
  value: z.union([z.string(), z.number()]).optional(),
  ref: z.string().min(1).optional(),
});

export const conditionNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionNodeSchema).min(1) }),
    z.object({ any: z.array(conditionNodeSchema).min(1) }),
    z.object({ not: conditionNodeSchema }),
    z.object({ compare: compareConditionSchema }),
    z.object({ time: timeConditionSchema }),
  ])
);

const recipientRefSchema = z.union([
  z.object({ type: z.literal('ref'), ref: z.string().min(1) }),
  z.object({ type: z.literal('user'), userId: uuidSchema }),
  z.object({ type: z.literal('email'), email: z.string().email() }),
  z.object({ type: z.literal('phone'), phone: z.string().min(4) }),
]);

const commsActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('comms.send'),
  params: z.object({
    channel: z.enum(['email', 'sms', 'in_app']),
    eventKey: z.string().min(1),
    recipients: z.array(recipientRefSchema).optional(),
    variables: z.record(z.unknown()).optional(),
    options: z
      .object({
        delayMinutes: z.number().int().nonnegative().optional(),
        digestMode: z.boolean().optional(),
      })
      .optional(),
  }),
});

const notificationActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('notification.create'),
  params: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    recipients: z.array(recipientRefSchema).optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
  }),
});

const jobUpdateActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('job.update'),
  params: z.object({
    jobId: uuidSchema.optional(),
    updates: z.object({
      status: z.string().optional(),
      progressStatus: z.string().optional(),
      crewId: uuidSchema.nullable().optional(),
      scheduledStart: z.string().datetime().nullable().optional(),
      scheduledEnd: z.string().datetime().nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      tags: z.array(z.string()).optional(),
    }),
  }),
});

const scheduleUpdateActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('schedule.update'),
  params: z.object({
    assignmentId: uuidSchema,
    date: z.string().datetime().optional(),
    startMinutes: z.number().int().optional(),
    endMinutes: z.number().int().optional(),
    crewId: uuidSchema.optional(),
    assignmentType: z.string().nullable().optional(),
    status: z.string().optional(),
  }),
});

const scheduleCreateActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('schedule.create'),
  params: z.object({
    jobId: uuidSchema,
    crewId: uuidSchema,
    date: z.string().datetime(),
    startMinutes: z.number().int(),
    endMinutes: z.number().int(),
    assignmentType: z.string().nullable().optional(),
    status: z.string().optional(),
  }),
});

const materialsAdjustActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('materials.adjust'),
  params: z.object({
    materialId: uuidSchema,
    quantity: z.number(),
    reason: z.string().nullable().optional(),
    eventType: z.enum(['stock_added', 'manual_adjustment', 'job_consumed', 'stocktake']).optional(),
    jobId: uuidSchema.nullable().optional(),
  }),
});

const taskCreateActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('task.create'),
  params: z.object({
    jobId: uuidSchema.optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    isRequired: z.boolean().optional(),
    order: z.number().int().nullable().optional(),
  }),
});

const webhookActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('webhook.call'),
  params: z.object({
    url: z.string().url(),
    method: z.enum(['POST', 'PUT']).optional(),
    payload: z.record(z.unknown()).optional(),
  }),
});

const invoiceDraftActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('invoice.draft'),
  params: z.object({
    jobId: uuidSchema.optional(),
  }),
});

const integrationEmitActionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('integration.emit'),
  params: z.object({
    providerKey: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
  }),
});

export const automationActionSchema = z.union([
  commsActionSchema,
  notificationActionSchema,
  jobUpdateActionSchema,
  scheduleUpdateActionSchema,
  scheduleCreateActionSchema,
  materialsAdjustActionSchema,
  taskCreateActionSchema,
  webhookActionSchema,
  invoiceDraftActionSchema,
  integrationEmitActionSchema,
]);

export const automationThrottleSchema = z.object({
  windowHours: z.number().int().positive(),
  maxPerWindow: z.number().int().positive().default(1),
  scope: z.enum(['org', 'entity', 'job']).default('entity'),
});

export const automationRuleCreateSchema = z.object({
  orgId: uuidSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  templateKey: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  triggerType: z.string().min(1),
  triggerFilters: z.record(z.unknown()).nullable().optional(),
  conditions: z.array(conditionNodeSchema).nullable().optional(),
  actions: z.array(automationActionSchema).min(1),
  throttle: automationThrottleSchema.nullable().optional(),
  createdByUserId: uuidSchema.nullable().optional(),
  updatedByUserId: uuidSchema.nullable().optional(),
  version: z.number().int().optional(),
});

export const automationRuleUpdateSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  templateKey: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  triggerType: z.string().min(1).optional(),
  triggerFilters: z.record(z.unknown()).nullable().optional(),
  conditions: z.array(conditionNodeSchema).nullable().optional(),
  actions: z.array(automationActionSchema).optional(),
  throttle: automationThrottleSchema.nullable().optional(),
  updatedByUserId: uuidSchema.nullable().optional(),
  version: z.number().int().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type AutomationRuleCreateInput = z.infer<typeof automationRuleCreateSchema>;
export type AutomationRuleUpdateInput = z.infer<typeof automationRuleUpdateSchema>;
