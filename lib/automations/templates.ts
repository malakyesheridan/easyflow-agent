import type { AutomationTemplate } from '@/lib/automations/types';
import { getAppEdition } from '@/lib/appEdition';

export const TRADE_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'job_scheduled_client_email',
    name: 'Job scheduled: email client confirmation',
    description: 'Send a booking confirmation when a job is scheduled.',
    category: 'communications',
    triggerType: 'job.assigned',
    actions: [
      {
        id: 'send-client-confirmation',
        type: 'comms.send',
        params: {
          channel: 'email',
          eventKey: 'job_scheduled',
          recipients: [{ type: 'ref', ref: 'job.client' }],
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
        helperText: 'Default: client contact on the job.',
      },
    ],
  },
  {
    key: 'job_scheduled_crew_sms',
    name: 'Job scheduled: SMS crew job pack',
    description: 'Send crew the schedule details via SMS.',
    category: 'communications',
    triggerType: 'job.assigned',
    actions: [
      {
        id: 'send-crew-sms',
        type: 'comms.send',
        params: {
          channel: 'sms',
          eventKey: 'job_assigned',
          recipients: [{ type: 'ref', ref: 'crew.assigned' }],
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
        helperText: 'Default: assigned crew members.',
      },
    ],
  },
  {
    key: 'job_in_progress_admin_notify',
    name: 'Job started: notify admin',
    description: 'Alert admins when a job moves into progress.',
    category: 'operations',
    triggerType: 'job.status.updated',
    triggerFilters: { status: 'in_progress' },
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Job in progress',
          body: 'A job has moved to in progress.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'job_completed_client_email',
    name: 'Job completed: email client summary',
    description: 'Send the completion summary to the client.',
    category: 'communications',
    triggerType: 'job.completed',
    actions: [
      {
        id: 'send-completion-email',
        type: 'comms.send',
        params: {
          channel: 'email',
          eventKey: 'job_completed',
          recipients: [{ type: 'ref', ref: 'job.client' }],
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'job_rescheduled_short_notice',
    name: 'Job rescheduled within 24h: notify crew + admin',
    description: 'Alerts on short-notice schedule changes (within 24 hours).',
    category: 'operations',
    triggerType: 'job.rescheduled',
    conditions: [
      {
        time: {
          op: 'within_hours',
          value: 24,
          ref: 'computed.scheduleStartAt',
        },
      },
    ],
    actions: [
      {
        id: 'notify-crew',
        type: 'notification.create',
        params: {
          title: 'Schedule change within 24h',
          body: 'A job was rescheduled within 24 hours of start.',
          recipients: [{ type: 'ref', ref: 'crew.assigned' }],
          severity: 'warning',
        },
      },
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Schedule change within 24h',
          body: 'A job was rescheduled within 24 hours of start.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'crewRecipients',
        label: 'Crew recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
      {
        key: 'adminRecipients',
        label: 'Admin recipients',
        type: 'recipients',
        path: 'actions.1.params.recipients',
      },
    ],
  },
  {
    key: 'daily_crew_digest',
    name: "Daily 6pm: tomorrow's jobs digest",
    description: 'Scheduled daily digest sent to each crew member. Requires time-based dispatcher.',
    category: 'communications',
    triggerType: 'time.daily',
    actions: [
      {
        id: 'send-digest',
        type: 'comms.send',
        params: {
          channel: 'email',
          eventKey: 'daily_crew_digest',
          recipients: [{ type: 'ref', ref: 'crew.assigned' }],
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_progress_half_notify',
    name: 'Progress 50%: notify admin',
    description: 'Alert admins when progress reaches 50%.',
    category: 'progress',
    triggerType: 'job.progress.updated',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.progressPercent' },
          op: 'eq',
          right: { value: 50 },
        },
      },
    ],
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Job progress 50%',
          body: 'A job has reached 50% completion.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_progress_near_complete',
    name: 'Progress 90%+: notify admin + draft invoice',
    description: 'Alert admins when progress reaches 90% and prep invoice draft.',
    category: 'progress',
    triggerType: 'job.progress.updated',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.progressPercent' },
          op: 'gte',
          right: { value: 90 },
        },
      },
    ],
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Job nearing completion',
          body: 'A job has reached 90% progress.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
      {
        id: 'draft-invoice',
        type: 'invoice.draft',
        params: {},
      },
    ],
    configSchema: [],
  },
  {
    key: 'material_low_stock',
    name: 'Material low stock: notify warehouse/admin',
    description: 'Alert warehouse/admins when a material dips below threshold.',
    category: 'materials',
    triggerType: 'material.stock.low',
    actions: [
      {
        id: 'notify-warehouse',
        type: 'notification.create',
        params: {
          title: 'Material low stock',
          body: 'A material is below its reorder threshold.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'material_usage_spike',
    name: 'Material usage spike: notify admin',
    description: 'Alert admins when usage exceeds the 30-day daily average.',
    category: 'materials',
    triggerType: 'material.usage.recorded',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.quantity' },
          op: 'gt',
          right: { ref: 'computed.materialAvgDailyUsage30d' },
        },
      },
    ],
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Material usage spike',
          body: 'Material usage exceeded the 30-day average.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_created_unassigned',
    name: 'New job unassigned: notify admin',
    description: 'Alert admins when a new job is created without a crew.',
    category: 'operations',
    triggerType: 'job.created',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.status' },
          op: 'eq',
          right: { value: 'unassigned' },
        },
      },
    ],
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Unassigned job created',
          body: 'A new job was created without a crew assigned.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_overdue_notify',
    name: 'Job overdue: notify admin',
    description: 'Scheduled daily check for overdue jobs (requires time-based dispatcher).',
    category: 'operations',
    triggerType: 'time.daily',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Overdue jobs detected',
          body: 'One or more jobs are overdue.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'crew_overbooked',
    name: 'Crew overbooked: notify admin',
    description: 'Alerts when a crew day exceeds scheduled capacity.',
    category: 'operations',
    triggerType: 'schedule.updated',
    conditions: [
      {
        compare: {
          left: { ref: 'computed.crewDailyMinutes' },
          op: 'gt',
          right: { value: 480 },
        },
      },
    ],
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Crew overbooked',
          body: 'A crew day exceeds scheduled capacity.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'maxMinutes',
        label: 'Max daily minutes',
        type: 'number',
        path: 'conditions.0.compare.right.value',
        defaultValue: 480,
      },
    ],
  },
  {
    key: 'job_type_install_checklist',
    name: 'Install job: create checklist tasks',
    description: 'Creates required checklist tasks for install jobs.',
    category: 'safety',
    triggerType: 'job.created',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.jobTypeId' },
          op: 'eq',
          right: { value: '' },
        },
      },
    ],
    actions: [
      {
        id: 'install-checklist-1',
        type: 'task.create',
        params: {
          title: 'Pre-install safety briefing',
          description: 'Confirm site safety requirements.',
          isRequired: true,
          order: 1,
        },
      },
      {
        id: 'install-checklist-2',
        type: 'task.create',
        params: {
          title: 'Install checklist',
          description: 'Complete install checklist items.',
          isRequired: true,
          order: 2,
        },
      },
    ],
    configSchema: [
      {
        key: 'jobTypeId',
        label: 'Job type ID',
        type: 'text',
        path: 'conditions.0.compare.right.value',
        helperText: 'Set to the install job type UUID.',
      },
    ],
  },
  {
    key: 'job_type_measure_checklist',
    name: 'Measure job: create checklist tasks',
    description: 'Creates required checklist tasks for measure jobs.',
    category: 'safety',
    triggerType: 'job.created',
    conditions: [
      {
        compare: {
          left: { ref: 'event.payload.jobTypeId' },
          op: 'eq',
          right: { value: '' },
        },
      },
    ],
    actions: [
      {
        id: 'measure-checklist-1',
        type: 'task.create',
        params: {
          title: 'Site measure checklist',
          description: 'Confirm openings and dimensions.',
          isRequired: true,
          order: 1,
        },
      },
    ],
    configSchema: [
      {
        key: 'jobTypeId',
        label: 'Job type ID',
        type: 'text',
        path: 'conditions.0.compare.right.value',
        helperText: 'Set to the measure job type UUID.',
      },
    ],
  },
  {
    key: 'invoice_sent_admin_notify',
    name: 'Invoice sent: notify admin',
    description: 'Notify admins when an invoice is sent.',
    category: 'operations',
    triggerType: 'invoice.sent',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Invoice sent',
          body: 'An invoice was sent to the client.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'invoice_issued_send_email',
    name: 'Invoice issued: email client',
    description: 'Send the issued invoice to the client.',
    category: 'communications',
    triggerType: 'invoice.issued',
    actions: [
      {
        id: 'send-invoice-email',
        type: 'comms.send',
        params: {
          channel: 'email',
          eventKey: 'invoice_issued',
          recipients: [{ type: 'ref', ref: 'job.client' }],
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
        helperText: 'Default: client contact on the job.',
      },
    ],
  },
  {
    key: 'invoice_overdue_reminder',
    name: 'Invoice overdue: email reminder',
    description: 'Send overdue reminders when an invoice is overdue.',
    category: 'communications',
    triggerType: 'invoice.overdue',
    actions: [
      {
        id: 'send-overdue-email',
        type: 'comms.send',
        params: {
          channel: 'email',
          eventKey: 'invoice_overdue',
          recipients: [{ type: 'ref', ref: 'job.client' }],
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'invoice_paid_admin_notify',
    name: 'Invoice paid: notify admin',
    description: 'Notify admins when an invoice is paid.',
    category: 'operations',
    triggerType: 'invoice.paid',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Invoice paid',
          body: 'An invoice has been paid.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'payment_received_admin_notify',
    name: 'Payment received: notify admin',
    description: 'Notify admins when a payment is received.',
    category: 'operations',
    triggerType: 'payment.received',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Payment received',
          body: 'A payment has been received.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_photos_added_notify',
    name: 'Job photos added: notify admin',
    description: 'Notify admins when new photos are uploaded.',
    category: 'operations',
    triggerType: 'job.photos.added',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Job photos uploaded',
          body: 'New job photos were uploaded.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'job_notes_updated_notify',
    name: 'Job notes updated: notify admin',
    description: 'Notify admins when job notes are updated.',
    category: 'operations',
    triggerType: 'job.notes.updated',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Job notes updated',
          body: 'Job notes were updated.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
  {
    key: 'material_stock_updated_notify',
    name: 'Material stock updated: notify warehouse',
    description: 'Notify warehouse/admins when stock levels change.',
    category: 'materials',
    triggerType: 'material.stock.updated',
    actions: [
      {
        id: 'notify-admins',
        type: 'notification.create',
        params: {
          title: 'Material stock updated',
          body: 'Stock levels changed for a material.',
          recipients: [{ type: 'ref', ref: 'org.admins' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [],
  },
];

export const REAL_ESTATE_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'contact_followup_overdue_notify',
    name: 'Contact follow-up overdue: notify owner',
    description: 'Alert the contact owner when a follow-up is overdue.',
    category: 'contacts',
    triggerType: 'contact.followup_overdue',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Contact follow-up overdue',
          body: 'A contact follow-up is overdue. Plan the next touch.',
          recipients: [{ type: 'ref', ref: 'contact.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'contact_hot_seller_intent_notify',
    name: 'Hot seller intent: notify owner',
    description: 'Notify the contact owner when intent is hot.',
    category: 'contacts',
    triggerType: 'contact.seller_intent_hot',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Hot seller intent',
          body: 'A contact just crossed into hot seller intent.',
          recipients: [{ type: 'ref', ref: 'contact.owner' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'appraisal_upcoming_notify',
    name: 'Appraisal upcoming (24h): notify owner',
    description: 'Notify the appraisal owner 24 hours before the appointment.',
    category: 'appraisals',
    triggerType: 'appraisal.upcoming_24h',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Appraisal upcoming',
          body: 'An appraisal is scheduled within the next 24 hours.',
          recipients: [{ type: 'ref', ref: 'appraisal.owner' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'appraisal_followup_due_notify',
    name: 'Appraisal follow-up due: notify owner',
    description: 'Alert the appraisal owner when follow-up is due.',
    category: 'appraisals',
    triggerType: 'appraisal.followup_due',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Appraisal follow-up due',
          body: 'An appraisal follow-up is due. Keep momentum while interest is high.',
          recipients: [{ type: 'ref', ref: 'appraisal.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'listing_milestone_overdue_notify',
    name: 'Listing milestone overdue: notify owner',
    description: 'Alert the listing owner when a milestone is overdue.',
    category: 'listings',
    triggerType: 'listing.milestone_overdue',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Listing milestone overdue',
          body: 'A listing milestone is overdue. Review the next step in the campaign.',
          recipients: [{ type: 'ref', ref: 'listing.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'listing_vendor_report_due_notify',
    name: 'Vendor report due: notify owner',
    description: 'Alert the listing owner when a vendor report is due.',
    category: 'reports',
    triggerType: 'listing.vendor_report_due',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Vendor report due',
          body: 'A vendor report is due for an active listing.',
          recipients: [{ type: 'ref', ref: 'listing.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'listing_vendor_update_overdue_notify',
    name: 'Vendor update overdue: notify owner',
    description: 'Alert the listing owner when vendor updates are overdue.',
    category: 'reports',
    triggerType: 'listing.vendor_update_overdue',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Vendor update overdue',
          body: 'Vendor updates are overdue. Send a quick update to protect the relationship.',
          recipients: [{ type: 'ref', ref: 'listing.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'listing_health_stalling_notify',
    name: 'Listing health stalling: notify owner',
    description: 'Alert the listing owner when campaign health is stalling.',
    category: 'listings',
    triggerType: 'listing.health_stalling',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Listing health stalling',
          body: 'Campaign health has dipped. Review pricing, marketing, and buyer feedback.',
          recipients: [{ type: 'ref', ref: 'listing.owner' }],
          severity: 'warning',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
  {
    key: 'report_generated_notify',
    name: 'Vendor report generated: notify owner',
    description: 'Notify the listing owner when a report is generated.',
    category: 'reports',
    triggerType: 'report.generated',
    actions: [
      {
        id: 'notify-owner',
        type: 'notification.create',
        params: {
          title: 'Vendor report generated',
          body: 'A vendor report is ready to share.',
          recipients: [{ type: 'ref', ref: 'listing.owner' }],
          severity: 'info',
        },
      },
    ],
    configSchema: [
      {
        key: 'recipients',
        label: 'Recipients',
        type: 'recipients',
        path: 'actions.0.params.recipients',
      },
    ],
  },
];

export function getAutomationTemplates(): AutomationTemplate[] {
  return getAppEdition() === 'trades' ? TRADE_AUTOMATION_TEMPLATES : REAL_ESTATE_AUTOMATION_TEMPLATES;
}

export const AUTOMATION_TEMPLATES = getAutomationTemplates();

export function getAutomationTemplateByKey(key: string): AutomationTemplate | null {
  return getAutomationTemplates().find((template) => template.key === key) ?? null;
}
