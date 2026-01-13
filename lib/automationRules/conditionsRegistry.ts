import type { TriggerKey } from './types';

export type ConditionValueType = 'enum' | 'number' | 'boolean' | 'percentage' | 'hours' | 'text';

export type ConditionDefinition = {
  key: string;
  label: string;
  description: string;
  valueType: ConditionValueType;
  operators?: string[];
  enumValues?: string[];
  requiresJobContext: boolean;
  requiresMaterialContext: boolean;
  requiresBillingContext: boolean;
  min?: number;
  max?: number;
  step?: number;
  enumSource?: 'crew' | 'materialCategory';
};

const JOB_TYPE_VALUES = ['install', 'repair', 'maintenance', 'quote'];
const JOB_PRIORITY_VALUES = ['low', 'normal', 'high', 'urgent'];
const JOB_STATUS_VALUES = ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const INVOICE_CUSTOMER_TYPES = ['residential', 'commercial'];
const PAYMENT_METHODS = ['stripe_card', 'eft', 'cash', 'cheque', 'pos', 'xero', 'other'];

const JOB_CONTEXT = {
  requiresJobContext: true,
  requiresMaterialContext: false,
  requiresBillingContext: false,
};

const MATERIAL_CONTEXT = {
  requiresJobContext: false,
  requiresMaterialContext: true,
  requiresBillingContext: false,
};

const BILLING_CONTEXT = {
  requiresJobContext: false,
  requiresMaterialContext: false,
  requiresBillingContext: true,
};

const NO_CONTEXT = {
  requiresJobContext: false,
  requiresMaterialContext: false,
  requiresBillingContext: false,
};

const JOB_TYPE_EQUALS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.type_equals',
  label: 'Job type equals',
  description: 'Match when the job type matches the selected value.',
  valueType: 'enum',
  enumValues: JOB_TYPE_VALUES,
};

const JOB_PRIORITY_EQUALS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.priority_equals',
  label: 'Job priority equals',
  description: 'Match when the job priority matches the selected value.',
  valueType: 'enum',
  enumValues: JOB_PRIORITY_VALUES,
};

const JOB_HAS_TAG: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.has_tag',
  label: 'Job has tag',
  description: 'Match when the job has the specified tag.',
  valueType: 'text',
};

const JOB_IS_ASSIGNED: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.is_assigned',
  label: 'Job is assigned',
  description: 'Match based on whether the job has an assigned crew.',
  valueType: 'boolean',
};

const JOB_ASSIGNED_TO_CREW: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.assigned_to_crew',
  label: 'Assigned to crew',
  description: 'Match when the job is assigned to a specific crew.',
  valueType: 'enum',
  enumValues: [],
  enumSource: 'crew',
};

const JOB_ASSIGNED_TO_ANY: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.assigned_to_any',
  label: 'Assigned to any crew',
  description: 'Match when the job has any crew assignment.',
  valueType: 'boolean',
};

const JOB_SCHEDULED_WITHIN_HOURS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.scheduled_within_hours',
  label: 'Scheduled within hours',
  description: 'Match when the scheduled start is within the next N hours.',
  valueType: 'hours',
  min: 1,
  max: 168,
};

const JOB_RESCHEDULED_WITHIN_HOURS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.rescheduled_within_hours',
  label: 'Rescheduled within hours',
  description: 'Match when the new scheduled start is within the next N hours.',
  valueType: 'hours',
  min: 1,
  max: 168,
};

const JOB_NEW_STATUS_EQUALS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.new_status_equals',
  label: 'New status equals',
  description: 'Match when the job changes to the selected status.',
  valueType: 'enum',
  enumValues: JOB_STATUS_VALUES,
};

const JOB_PREVIOUS_STATUS_EQUALS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.previous_status_equals',
  label: 'Previous status equals',
  description: 'Match when the job changes from the selected status.',
  valueType: 'enum',
  enumValues: JOB_STATUS_VALUES,
};

const JOB_PROGRESS_GTE: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.progress_gte',
  label: 'Progress at least',
  description: 'Match when job progress is greater than or equal to a percentage.',
  valueType: 'percentage',
  min: 0,
  max: 100,
};

const JOB_PROGRESS_LTE: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.progress_lte',
  label: 'Progress at most',
  description: 'Match when job progress is less than or equal to a percentage.',
  valueType: 'percentage',
  min: 0,
  max: 100,
};

const JOB_WAS_PAID: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.was_paid',
  label: 'Job was paid',
  description: 'Match when the job has been paid.',
  valueType: 'boolean',
  requiresBillingContext: true,
};

const JOB_PHOTO_COUNT_GTE: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.photo_count_gte',
  label: 'Photo count at least',
  description: 'Match when the job has at least N photos.',
  valueType: 'number',
  min: 1,
};

const JOB_NOTE_CONTAINS: ConditionDefinition = {
  ...JOB_CONTEXT,
  key: 'job.note_contains',
  label: 'Note contains',
  description: 'Match when the latest note contains the provided text.',
  valueType: 'text',
};

const MATERIAL_STOCK_BELOW: ConditionDefinition = {
  ...MATERIAL_CONTEXT,
  key: 'material.stock_below',
  label: 'Stock below',
  description: 'Match when available stock is below the specified amount.',
  valueType: 'number',
  min: 0,
};

const MATERIAL_CATEGORY_EQUALS: ConditionDefinition = {
  ...MATERIAL_CONTEXT,
  key: 'material.category_equals',
  label: 'Material category equals',
  description: 'Match when the material category matches the selected value.',
  valueType: 'enum',
  enumValues: [],
  enumSource: 'materialCategory',
};

const MATERIAL_IS_CRITICAL: ConditionDefinition = {
  ...MATERIAL_CONTEXT,
  key: 'material.is_critical',
  label: 'Material is critical',
  description: 'Match when material availability is critical.',
  valueType: 'boolean',
};

const MATERIAL_STOCK_DELTA_GTE: ConditionDefinition = {
  ...MATERIAL_CONTEXT,
  key: 'material.stock_delta_gte',
  label: 'Stock delta at least',
  description: 'Match when the stock change is greater than or equal to the specified amount.',
  valueType: 'number',
};

const INVOICE_TOTAL_GTE: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'invoice.total_gte',
  label: 'Invoice total at least',
  description: 'Match when the invoice total is greater than or equal to the specified amount.',
  valueType: 'number',
  min: 0,
};

const INVOICE_IS_OVERDUE: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'invoice.is_overdue',
  label: 'Invoice is overdue',
  description: 'Match when the invoice is overdue.',
  valueType: 'boolean',
};

const INVOICE_CUSTOMER_TYPE_EQUALS: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'invoice.customer_type_equals',
  label: 'Customer type equals',
  description: 'Match when the invoice customer type matches the selected value.',
  valueType: 'enum',
  enumValues: INVOICE_CUSTOMER_TYPES,
};

const PAYMENT_AMOUNT_GTE: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'payment.amount_gte',
  label: 'Payment amount at least',
  description: 'Match when the payment amount is greater than or equal to the specified amount.',
  valueType: 'number',
  min: 0,
};

const PAYMENT_METHOD_EQUALS: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'payment.method_equals',
  label: 'Payment method equals',
  description: 'Match when the payment method matches the selected value.',
  valueType: 'enum',
  enumValues: PAYMENT_METHODS,
};

const INVOICE_IS_FULLY_PAID: ConditionDefinition = {
  ...BILLING_CONTEXT,
  key: 'invoice.is_fully_paid',
  label: 'Invoice is fully paid',
  description: 'Match when the invoice has been fully paid.',
  valueType: 'boolean',
};

const TIME_LOCAL_HOUR_EQUALS: ConditionDefinition = {
  ...NO_CONTEXT,
  key: 'time.local_hour_equals',
  label: 'Local hour equals',
  description: 'Match when the local hour equals the selected value.',
  valueType: 'number',
  min: 0,
  max: 23,
};

const JOB_OVERDUE_EXISTS: ConditionDefinition = {
  ...NO_CONTEXT,
  key: 'job.overdue_exists',
  label: 'Overdue job exists',
  description: 'Match when at least one overdue job exists.',
  valueType: 'boolean',
};

const MATERIAL_STOCK_LOW_EXISTS: ConditionDefinition = {
  ...NO_CONTEXT,
  key: 'material.stock_low_exists',
  label: 'Low stock exists',
  description: 'Match when at least one low-stock material alert exists.',
  valueType: 'boolean',
};

export const CONDITIONS_BY_TRIGGER: Record<TriggerKey, ConditionDefinition[]> = {
  'job.created': [JOB_TYPE_EQUALS, JOB_PRIORITY_EQUALS, JOB_HAS_TAG, JOB_IS_ASSIGNED],
  'job.assigned': [JOB_ASSIGNED_TO_CREW, JOB_ASSIGNED_TO_ANY, JOB_SCHEDULED_WITHIN_HOURS],
  'job.rescheduled': [JOB_RESCHEDULED_WITHIN_HOURS, JOB_PRIORITY_EQUALS, JOB_HAS_TAG],
  'job.status_updated': [JOB_NEW_STATUS_EQUALS, JOB_PREVIOUS_STATUS_EQUALS, JOB_PRIORITY_EQUALS, JOB_HAS_TAG],
  'job.progress_updated': [JOB_PROGRESS_GTE, JOB_PROGRESS_LTE, JOB_HAS_TAG],
  'job.completed': [JOB_TYPE_EQUALS, JOB_HAS_TAG, JOB_WAS_PAID],
  'job.photo_added': [JOB_PHOTO_COUNT_GTE, JOB_HAS_TAG],
  'job.notes_updated': [JOB_NOTE_CONTAINS, JOB_HAS_TAG],
  'material.stock_low': [MATERIAL_STOCK_BELOW, MATERIAL_CATEGORY_EQUALS, MATERIAL_IS_CRITICAL],
  'material.stock_updated': [MATERIAL_STOCK_DELTA_GTE, MATERIAL_CATEGORY_EQUALS],
  'invoice.sent': [INVOICE_TOTAL_GTE, INVOICE_IS_OVERDUE, INVOICE_CUSTOMER_TYPE_EQUALS],
  'invoice.issued': [INVOICE_TOTAL_GTE, INVOICE_IS_OVERDUE, INVOICE_CUSTOMER_TYPE_EQUALS],
  'invoice.paid': [INVOICE_TOTAL_GTE, INVOICE_IS_FULLY_PAID, INVOICE_CUSTOMER_TYPE_EQUALS],
  'invoice.overdue': [INVOICE_TOTAL_GTE, INVOICE_IS_OVERDUE, INVOICE_CUSTOMER_TYPE_EQUALS],
  'payment.received': [PAYMENT_AMOUNT_GTE, PAYMENT_METHOD_EQUALS, INVOICE_IS_FULLY_PAID],
  'payment.recorded': [PAYMENT_AMOUNT_GTE, PAYMENT_METHOD_EQUALS, INVOICE_IS_FULLY_PAID],
  'time.daily': [TIME_LOCAL_HOUR_EQUALS, JOB_OVERDUE_EXISTS, MATERIAL_STOCK_LOW_EXISTS],
};

export const CONDITION_DEFINITIONS_BY_KEY: Record<string, ConditionDefinition> = Object.fromEntries(
  Object.values(CONDITIONS_BY_TRIGGER)
    .flat()
    .map((definition) => [definition.key, definition])
);

export function getConditionDefinition(key: string): ConditionDefinition | undefined {
  return CONDITION_DEFINITIONS_BY_KEY[key];
}

/*
Checklist:
- No trigger shows empty conditions.
- Every condition has a value input.
- Invalid trigger/condition pairs are impossible.
- Rules with logically impossible evaluation cannot be enabled.
- Existing template automations are unaffected.
*/
