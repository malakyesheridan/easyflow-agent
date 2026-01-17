import type { RuleAction, TriggerKey } from '@/lib/automationRules/types';
import { TRIGGER_KEYS } from '@/lib/automationRules/types';
import { CONDITIONS_BY_TRIGGER, CONDITION_DEFINITIONS_BY_KEY } from '@/lib/automationRules/conditionsRegistry';
import type { AppEdition } from '@/lib/appEdition';

export const TRIGGER_LABELS: Record<TriggerKey, { label: string; description: string; group: string }> = {
  'contact.followup_overdue': {
    label: 'Contact follow-up overdue',
    description: 'A contact follow-up is overdue.',
    group: 'Contacts',
  },
  'contact.seller_intent_hot': {
    label: 'Seller intent hot',
    description: 'Seller intent crosses the hot threshold.',
    group: 'Contacts',
  },
  'appraisal.upcoming_24h': {
    label: 'Appraisal upcoming (24h)',
    description: 'An appraisal appointment is within 24 hours.',
    group: 'Appraisals',
  },
  'appraisal.followup_due': {
    label: 'Appraisal follow-up due',
    description: 'An appraisal follow-up task is due.',
    group: 'Appraisals',
  },
  'appraisal.stage_changed': {
    label: 'Appraisal stage changed',
    description: 'An appraisal stage changes.',
    group: 'Appraisals',
  },
  'listing.milestone_overdue': {
    label: 'Listing milestone overdue',
    description: 'A listing milestone is overdue.',
    group: 'Listings',
  },
  'listing.vendor_report_due': {
    label: 'Vendor report due',
    description: 'A vendor report is due for a listing.',
    group: 'Reports',
  },
  'listing.vendor_update_overdue': {
    label: 'Vendor update overdue',
    description: 'Vendor updates are overdue for a listing.',
    group: 'Reports',
  },
  'listing.health_stalling': {
    label: 'Listing health stalling',
    description: 'Campaign health drops below the stalling threshold.',
    group: 'Listings',
  },
  'report.generated': {
    label: 'Vendor report generated',
    description: 'A vendor report is generated and shared.',
    group: 'Reports',
  },
  'job.created': { label: 'Job created', description: 'A job is created.', group: 'Jobs' },
  'job.assigned': { label: 'Job assigned', description: 'A job is assigned to a crew.', group: 'Jobs' },
  'job.rescheduled': { label: 'Job rescheduled', description: 'A job assignment is rescheduled.', group: 'Jobs' },
  'job.status_updated': { label: 'Job status updated', description: 'A job status changes.', group: 'Jobs' },
  'job.progress_updated': { label: 'Job progress updated', description: 'Job progress changes.', group: 'Jobs' },
  'job.completed': { label: 'Job completed', description: 'A job is marked completed.', group: 'Jobs' },
  'job.photo_added': { label: 'Job photo added', description: 'A new job photo is added.', group: 'Jobs' },
  'job.notes_updated': { label: 'Job notes updated', description: 'Job notes change.', group: 'Jobs' },
  'invoice.sent': { label: 'Invoice sent', description: 'An invoice is sent to a customer.', group: 'Billing' },
  'invoice.issued': { label: 'Invoice issued', description: 'An invoice is issued.', group: 'Billing' },
  'invoice.paid': { label: 'Invoice paid', description: 'An invoice is fully paid.', group: 'Billing' },
  'invoice.overdue': { label: 'Invoice overdue', description: 'An invoice is overdue.', group: 'Billing' },
  'payment.received': { label: 'Payment received', description: 'A payment is received.', group: 'Billing' },
  'payment.recorded': { label: 'Payment recorded', description: 'An external payment is recorded.', group: 'Billing' },
  'material.stock_low': { label: 'Material stock low', description: 'Material stock falls below threshold.', group: 'Materials' },
  'material.stock_updated': { label: 'Material stock updated', description: 'Material stock changes.', group: 'Materials' },
  'time.daily': { label: 'Daily time trigger', description: 'Runs once per day (time-based).', group: 'Time' },
};

export const TRIGGER_GROUPS = ['Contacts', 'Appraisals', 'Listings', 'Reports', 'Jobs', 'Materials', 'Billing', 'Time'];

export const TRIGGER_GROUPS_BY_EDITION: Record<AppEdition, string[]> = {
  real_estate: ['Contacts', 'Appraisals', 'Listings', 'Reports', 'Time'],
  trades: ['Jobs', 'Materials', 'Billing', 'Time'],
};

export function getTriggerGroupsForEdition(edition: AppEdition): string[] {
  return TRIGGER_GROUPS_BY_EDITION[edition] ?? TRIGGER_GROUPS;
}

export const CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CONDITION_DEFINITIONS_BY_KEY).map(([key, definition]) => [key, definition.label])
);

export const ACTION_LABELS: Record<RuleAction['type'], string> = {
  'comm.send_email': 'Send email',
  'comm.send_sms': 'Send SMS',
  'comm.send_inapp': 'Send in-app notification',
  'job.add_tag': 'Add job tag',
  'job.add_flag': 'Add job flag',
  'tasks.create_checklist': 'Create checklist tasks',
  'invoice.create_draft': 'Create draft invoice',
  'reminder.create_internal': 'Create internal reminder',
};

export const CONDITION_OPTIONS_BY_TRIGGER: Record<TriggerKey, string[]> = Object.fromEntries(
  Object.entries(CONDITIONS_BY_TRIGGER).map(([triggerKey, definitions]) => [
    triggerKey,
    definitions.map((definition) => definition.key),
  ])
) as Record<TriggerKey, string[]>;

export const COMM_DEFAULT_TEMPLATE_BY_TO: Record<string, string> = {
  customer: 'automation.customer_notify_generic',
  admin: 'automation.admin_notify_generic',
  crew_assigned: 'automation.crew_notify_generic',
  ops: 'automation.admin_notify_generic',
};

export const COMM_ACTION_TYPES: RuleAction['type'][] = ['comm.send_email', 'comm.send_sms', 'comm.send_inapp'];

export const ACTION_ORDER: RuleAction['type'][] = [
  'comm.send_email',
  'comm.send_sms',
  'comm.send_inapp',
  'job.add_tag',
  'job.add_flag',
  'tasks.create_checklist',
  'invoice.create_draft',
  'reminder.create_internal',
];

export const TRIGGER_KEYS_LIST = TRIGGER_KEYS;

export const ACTION_OPTIONS_BY_EDITION: Record<AppEdition, RuleAction['type'][]> = {
  real_estate: ['comm.send_email', 'comm.send_sms', 'comm.send_inapp', 'reminder.create_internal'],
  trades: ACTION_ORDER,
};

export function getActionOptionsForEdition(edition: AppEdition): RuleAction['type'][] {
  return ACTION_OPTIONS_BY_EDITION[edition] ?? ACTION_ORDER;
}
