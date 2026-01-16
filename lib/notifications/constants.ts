export const NOTIFICATION_TYPES = [
  'job_progress',
  'warehouse_alert',
  'announcement',
  'integration',
  'automation',
  'contact_followup_overdue',
  'new_hot_prospect',
  'appraisal_upcoming',
  'appraisal_followup_due',
  'appraisal_stage_changed',
  'listing_milestone_overdue',
  'vendor_report_due',
  'vendor_update_overdue',
  'new_buyer_match',
  'listing_health_stalling',
  'inspection_scheduled',
  'report_generated',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const NOTIFICATION_SEVERITIES = ['info', 'warn', 'critical'] as const;
export type NotificationSeverity = typeof NOTIFICATION_SEVERITIES[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  job_progress: 'Job',
  warehouse_alert: 'Warehouse',
  announcement: 'Announcement',
  integration: 'Integration',
  automation: 'Automation',
  contact_followup_overdue: 'Contact follow-up',
  new_hot_prospect: 'Hot prospect',
  appraisal_upcoming: 'Appraisal',
  appraisal_followup_due: 'Appraisal',
  appraisal_stage_changed: 'Appraisal',
  listing_milestone_overdue: 'Listing',
  vendor_report_due: 'Vendor report',
  vendor_update_overdue: 'Vendor update',
  new_buyer_match: 'Buyer match',
  listing_health_stalling: 'Listing health',
  inspection_scheduled: 'Inspection',
  report_generated: 'Report',
};

export const NOTIFICATION_TYPE_BADGES: Record<NotificationType, string> = {
  job_progress: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  warehouse_alert: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  announcement: 'bg-accent-gold/15 text-accent-gold border-accent-gold/30',
  integration: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  automation: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
  contact_followup_overdue: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
  new_hot_prospect: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
  appraisal_upcoming: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  appraisal_followup_due: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  appraisal_stage_changed: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  listing_milestone_overdue: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  vendor_report_due: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  vendor_update_overdue: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  new_buyer_match: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
  listing_health_stalling: 'bg-orange-500/15 text-orange-200 border-orange-500/30',
  inspection_scheduled: 'bg-teal-500/15 text-teal-200 border-teal-500/30',
  report_generated: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
};

export const NOTIFICATION_SEVERITY_BADGES: Record<NotificationSeverity, string> = {
  info: 'bg-bg-section text-text-tertiary border-border-subtle',
  warn: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-200 border-red-500/30',
};
