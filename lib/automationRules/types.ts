export const TRIGGER_KEYS = [
  'contact.followup_overdue',
  'contact.seller_intent_hot',
  'appraisal.upcoming_24h',
  'appraisal.followup_due',
  'appraisal.stage_changed',
  'listing.milestone_overdue',
  'listing.vendor_report_due',
  'listing.vendor_update_overdue',
  'listing.health_stalling',
  'report.generated',
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
  'material.stock_low',
  'material.stock_updated',
  'time.daily',
] as const;

export type TriggerKey = (typeof TRIGGER_KEYS)[number];

export type RuleCondition = {
  key: string;
  value: string | number | boolean;
  operator?: string;
};

export type RuleAction =
  | {
      type: 'comm.send_email';
      to: 'customer' | 'admin' | 'crew_assigned' | 'custom';
      templateKey: string;
      customEmail?: string;
    }
  | {
      type: 'comm.send_sms';
      to: 'customer' | 'admin' | 'crew_assigned' | 'custom';
      templateKey: string;
      customPhone?: string;
    }
  | {
      type: 'comm.send_inapp';
      to: 'admin' | 'crew_assigned' | 'ops';
      templateKey: string;
    }
  | { type: 'job.add_tag'; tag: string }
  | { type: 'job.add_flag'; flag: string }
  | { type: 'tasks.create_checklist'; checklistKey: string }
  | { type: 'invoice.create_draft'; mode: 'from_job' }
  | { type: 'reminder.create_internal'; minutesFromNow: number; message: string };

export type AutomationRuleDraft = {
  name: string;
  description?: string | null;
  triggerKey: TriggerKey;
  triggerVersion?: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
};

export type RuleFlags = {
  isCustomerFacing: boolean;
  requiresSms: boolean;
  requiresEmail: boolean;
};
