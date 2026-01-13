import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ok, err, type Result } from '@/lib/result';
import { commTemplates } from '@/db/schema/comm_templates';
import { commProviderStatus } from '@/db/schema/comm_provider_status';
import { orgSettings } from '@/db/schema/org_settings';
import { resolveSenderIdentity } from '@/lib/communications/sender';
import { getDb } from '@/lib/db';
import type { AutomationRuleDraft, RuleAction, RuleCondition, RuleFlags, TriggerKey } from './types';
import { TRIGGER_KEYS } from './types';
import type { ConditionDefinition } from './conditionsRegistry';
import { CONDITIONS_BY_TRIGGER } from './conditionsRegistry';

const triggerKeySchema = z.enum(TRIGGER_KEYS);

const conditionSchema: z.ZodType<RuleCondition> = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  operator: z.string().optional(),
});

const commEmailActionSchema = z.object({
  type: z.literal('comm.send_email'),
  to: z.enum(['customer', 'admin', 'crew_assigned', 'custom']),
  templateKey: z.string().min(1),
  customEmail: z.string().email().optional(),
});

const commSmsActionSchema = z.object({
  type: z.literal('comm.send_sms'),
  to: z.enum(['customer', 'admin', 'crew_assigned', 'custom']),
  templateKey: z.string().min(1),
  customPhone: z.string().min(6).optional(),
});

const commInAppActionSchema = z.object({
  type: z.literal('comm.send_inapp'),
  to: z.enum(['admin', 'crew_assigned', 'ops']),
  templateKey: z.string().min(1),
});

const actionSchema: z.ZodType<RuleAction> = z.union([
  commEmailActionSchema,
  commSmsActionSchema,
  commInAppActionSchema,
  z.object({
    type: z.literal('job.add_tag'),
    tag: z.string().min(1),
  }),
  z.object({
    type: z.literal('job.add_flag'),
    flag: z.string().min(1),
  }),
  z.object({
    type: z.literal('tasks.create_checklist'),
    checklistKey: z.string().min(1),
  }),
  z.object({
    type: z.literal('invoice.create_draft'),
    mode: z.literal('from_job'),
  }),
  z.object({
    type: z.literal('reminder.create_internal'),
    minutesFromNow: z.number().int().min(1).max(24 * 60),
    message: z.string().min(1).max(500),
  }),
]);

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(140),
    description: z.string().trim().max(500).nullable().optional(),
    triggerKey: triggerKeySchema,
    triggerVersion: z.number().int().min(1).optional(),
    conditions: z.array(conditionSchema).max(10).optional(),
    actions: z.array(actionSchema).min(1).max(5),
  })
  .superRefine((value, ctx) => {
    value.actions.forEach((action, index) => {
      if (action.type === 'comm.send_email' && action.to === 'custom' && !action.customEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'customEmail is required when sending email to a custom recipient',
          path: ['actions', index, 'customEmail'],
        });
      }
      if (action.type === 'comm.send_sms' && action.to === 'custom' && !action.customPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'customPhone is required when sending SMS to a custom recipient',
          path: ['actions', index, 'customPhone'],
        });
      }
    });
  });

const JOB_CONTEXT_TRIGGERS = new Set<TriggerKey>([
  'job.created',
  'job.assigned',
  'job.rescheduled',
  'job.status_updated',
  'job.progress_updated',
  'job.completed',
  'job.photo_added',
  'job.notes_updated',
]);

const MATERIAL_CONTEXT_TRIGGERS = new Set<TriggerKey>(['material.stock_low', 'material.stock_updated']);

const BILLING_CONTEXT_TRIGGERS = new Set<TriggerKey>([
  'job.created',
  'job.assigned',
  'job.rescheduled',
  'job.status_updated',
  'job.progress_updated',
  'job.completed',
  'job.photo_added',
  'job.notes_updated',
  'invoice.sent',
  'invoice.issued',
  'invoice.paid',
  'invoice.overdue',
  'payment.received',
  'payment.recorded',
]);

export type ConditionValidationError = {
  code: string;
  message: string;
  field: string;
};

function validateConditionValue(
  definition: ConditionDefinition | undefined,
  value: unknown,
  field: string
): ConditionValidationError | null {
  if (!definition) return { code: 'condition_unknown', message: 'Unknown condition', field };

  if (definition.valueType === 'enum') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { code: 'condition_value_invalid', message: 'Enum value must be a non-empty string', field };
    }
    if ((definition.enumValues ?? []).length > 0 && !definition.enumValues?.includes(value)) {
      return { code: 'condition_value_invalid', message: 'Enum value is not allowed', field };
    }
    return null;
  }

  if (definition.valueType === 'boolean') {
    if (typeof value !== 'boolean') {
      return { code: 'condition_value_invalid', message: 'Boolean value is required', field };
    }
    return null;
  }

  if (definition.valueType === 'text') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { code: 'condition_value_invalid', message: 'Text value must be a non-empty string', field };
    }
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { code: 'condition_value_invalid', message: 'Numeric value is required', field };
  }

  if (definition.min !== undefined && value < definition.min) {
    return { code: 'condition_value_out_of_range', message: 'Value is below the minimum', field };
  }

  if (definition.max !== undefined && value > definition.max) {
    return { code: 'condition_value_out_of_range', message: 'Value is above the maximum', field };
  }

  return null;
}

export function validateConditionsForTrigger(
  triggerKey: TriggerKey,
  conditions: RuleCondition[]
): ConditionValidationError[] {
  const errors: ConditionValidationError[] = [];
  const allowedDefinitions = CONDITIONS_BY_TRIGGER[triggerKey] ?? [];
  const allowedByKey = new Map(allowedDefinitions.map((definition) => [definition.key, definition]));

  conditions.forEach((condition, index) => {
    const fieldPrefix = `conditions[${index}]`;
    if (!condition.key || typeof condition.key !== 'string' || condition.key.trim().length === 0) {
      errors.push({ code: 'condition_key_missing', message: 'Condition key is required', field: `${fieldPrefix}.key` });
      return;
    }

    const definition = allowedByKey.get(condition.key);
    if (!definition) {
      errors.push({
        code: 'condition_not_allowed',
        message: `Condition ${condition.key} is not allowed for trigger ${triggerKey}.`,
        field: `${fieldPrefix}.key`,
      });
      return;
    }

    if (definition.requiresJobContext && !JOB_CONTEXT_TRIGGERS.has(triggerKey)) {
      errors.push({
        code: 'condition_context_invalid',
        message: 'Condition requires job context which is not available for this trigger.',
        field: `${fieldPrefix}.key`,
      });
    }

    if (definition.requiresMaterialContext && !MATERIAL_CONTEXT_TRIGGERS.has(triggerKey)) {
      errors.push({
        code: 'condition_context_invalid',
        message: 'Condition requires material context which is not available for this trigger.',
        field: `${fieldPrefix}.key`,
      });
    }

    if (definition.requiresBillingContext && !BILLING_CONTEXT_TRIGGERS.has(triggerKey)) {
      errors.push({
        code: 'condition_context_invalid',
        message: 'Condition requires billing context which is not available for this trigger.',
        field: `${fieldPrefix}.key`,
      });
    }

    if (condition.operator && definition.operators && !definition.operators.includes(condition.operator)) {
      errors.push({
        code: 'condition_operator_invalid',
        message: 'Condition operator is not allowed',
        field: `${fieldPrefix}.operator`,
      });
    }

    if (condition.operator && !definition.operators && condition.operator !== '=') {
      errors.push({
        code: 'condition_operator_invalid',
        message: 'Condition operator is not allowed',
        field: `${fieldPrefix}.operator`,
      });
    }

    const valueError = validateConditionValue(definition, condition.value, `${fieldPrefix}.value`);
    if (valueError) errors.push(valueError);
  });

  return errors;
}

function getChannelForAction(action: RuleAction): 'email' | 'sms' | 'in_app' | null {
  if (action.type === 'comm.send_email') return 'email';
  if (action.type === 'comm.send_sms') return 'sms';
  if (action.type === 'comm.send_inapp') return 'in_app';
  return null;
}

export function deriveRuleFlags(actions: RuleAction[]): RuleFlags {
  let isCustomerFacing = false;
  let requiresSms = false;
  let requiresEmail = false;

  for (const action of actions) {
    if (action.type === 'comm.send_email') {
      requiresEmail = true;
      if (action.to === 'customer') isCustomerFacing = true;
    }
    if (action.type === 'comm.send_sms') {
      requiresSms = true;
      if (action.to === 'customer') isCustomerFacing = true;
    }
    if (action.type === 'comm.send_inapp') {
      // in-app actions are internal only
    }
  }

  return { isCustomerFacing, requiresSms, requiresEmail };
}

function hasStatusCondition(conditions: RuleCondition[]): boolean {
  return conditions.some((condition) => condition.key === 'job.new_status_equals' || condition.key === 'job.previous_status_equals');
}

function hasProgressCondition(conditions: RuleCondition[]): boolean {
  return conditions.some((condition) => condition.key === 'job.progress_gte' || condition.key === 'job.progress_lte');
}

const STATUS_CONDITION_ERROR: ConditionValidationError = {
  code: 'status_condition_missing',
  message: 'Status-based triggers must specify which status change to listen for.',
  field: 'conditions',
};

const PROGRESS_CONDITION_ERROR: ConditionValidationError = {
  code: 'progress_condition_missing',
  message: 'Progress triggers must specify a progress threshold.',
  field: 'conditions',
};

async function ensureTemplatesExist(params: {
  db: ReturnType<typeof getDb>;
  orgId: string;
  actions: RuleAction[];
}): Promise<string[]> {
  const needed = new Set<string>();
  const keys: string[] = [];
  const channels: string[] = [];

  for (const action of params.actions) {
    const channel = getChannelForAction(action);
    if (!channel) continue;
    if (action.type === 'comm.send_email' || action.type === 'comm.send_sms' || action.type === 'comm.send_inapp') {
      const key = `${action.templateKey}::${channel}`;
      needed.add(key);
      keys.push(action.templateKey);
      channels.push(channel);
    }
  }

  if (needed.size === 0) return [];

  const rows = await params.db
    .select({ key: commTemplates.key, channel: commTemplates.channel })
    .from(commTemplates)
    .where(and(eq(commTemplates.orgId, params.orgId), inArray(commTemplates.key, keys), inArray(commTemplates.channel, channels)))
    .orderBy(desc(commTemplates.version));

  const found = new Set(rows.map((row) => `${row.key}::${row.channel}`));
  return Array.from(needed).filter((key) => !found.has(key));
}

export async function validateRuleForSave(params: {
  db: ReturnType<typeof getDb>;
  orgId: string;
  input: AutomationRuleDraft;
}): Promise<Result<{ rule: AutomationRuleDraft; flags: RuleFlags; warnings: string[] }>> {
  const parsed = ruleInputSchema.safeParse(params.input);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', 'Invalid automation rule input', parsed.error.flatten());
  }

  const rule = {
    ...parsed.data,
    triggerVersion: parsed.data.triggerVersion ?? 1,
    conditions: parsed.data.conditions ?? [],
  } as AutomationRuleDraft;

  const conditionErrors = validateConditionsForTrigger(rule.triggerKey, rule.conditions);
  if (conditionErrors.length > 0) {
    return err('VALIDATION_ERROR', 'Invalid conditions for trigger', { errors: conditionErrors });
  }

  const missingTemplates = await ensureTemplatesExist({ db: params.db, orgId: params.orgId, actions: rule.actions });
  if (missingTemplates.length > 0) {
    return err('VALIDATION_ERROR', 'One or more templates are missing', { missingTemplates });
  }

  const flags = deriveRuleFlags(rule.actions);
  const warnings: string[] = [];
  if (rule.triggerKey === 'job.status_updated' && !hasStatusCondition(rule.conditions)) {
    return err('VALIDATION_ERROR', STATUS_CONDITION_ERROR.message, { errors: [STATUS_CONDITION_ERROR] });
  }
  if (rule.triggerKey === 'job.progress_updated' && !hasProgressCondition(rule.conditions)) {
    return err('VALIDATION_ERROR', PROGRESS_CONDITION_ERROR.message, { errors: [PROGRESS_CONDITION_ERROR] });
  }

  return ok({ rule, flags, warnings });
}

export async function validateRuleForEnable(params: {
  db: ReturnType<typeof getDb>;
  orgId: string;
  input: AutomationRuleDraft;
  confirmedCustomerFacing?: boolean;
  confirmedStatusTrigger?: boolean;
}): Promise<Result<{ rule: AutomationRuleDraft; flags: RuleFlags; warnings: string[] }>> {
  const saveResult = await validateRuleForSave({ db: params.db, orgId: params.orgId, input: params.input });
  if (!saveResult.ok) return saveResult;

  const { rule, flags, warnings } = saveResult.data;

  if (rule.triggerKey === 'job.progress_updated' && !hasProgressCondition(rule.conditions)) {
    return err('VALIDATION_ERROR', PROGRESS_CONDITION_ERROR.message, { errors: [PROGRESS_CONDITION_ERROR] });
  }

  if (rule.triggerKey === 'job.status_updated' && !hasStatusCondition(rule.conditions)) {
    return err('VALIDATION_ERROR', STATUS_CONDITION_ERROR.message, { errors: [STATUS_CONDITION_ERROR] });
  }

  if (flags.isCustomerFacing && !params.confirmedCustomerFacing) {
    return err('CONFIRMATION_REQUIRED', 'Customer-facing actions require confirmation', { code: 'customer_facing' });
  }

  if (flags.requiresEmail) {
    const resendConfigured = Boolean(process.env.RESEND_API_KEY);
    if (!resendConfigured) {
      return err('PROVIDER_NOT_READY', 'Email provider is not configured');
    }

    const [settingsRow] = await params.db
      .select({
        commFromName: orgSettings.commFromName,
        commFromEmail: orgSettings.commFromEmail,
        commReplyToEmail: orgSettings.commReplyToEmail,
      })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, params.orgId))
      .limit(1);

    const senderIdentity = resolveSenderIdentity({
      commFromName: settingsRow?.commFromName ?? null,
      commFromEmail: settingsRow?.commFromEmail ?? null,
      commReplyToEmail: settingsRow?.commReplyToEmail ?? null,
    });

    if (!senderIdentity.fromEmail) {
      return err('PROVIDER_NOT_READY', 'Sender identity is missing for email');
    }
  }

  if (flags.requiresSms) {
    const [statusRow] = await params.db
      .select({ smsEnabled: commProviderStatus.smsEnabled })
      .from(commProviderStatus)
      .where(eq(commProviderStatus.orgId, params.orgId))
      .limit(1);

    if (!statusRow?.smsEnabled) {
      return err('PROVIDER_NOT_READY', 'SMS provider is not configured');
    }
  }

  return ok({ rule, flags, warnings });
}
