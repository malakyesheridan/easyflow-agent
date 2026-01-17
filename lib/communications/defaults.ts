import type { RecipientRules, TimingRules } from '@/lib/communications/types';
import { getAppEdition } from '@/lib/appEdition';

export type DefaultTemplateSeed = {
  key: string;
  channel: 'email' | 'sms' | 'in_app';
  name: string;
  subject?: string | null;
  body: string;
  bodyHtml?: string | null;
  variablesSchema?: Record<string, unknown>;
  isEnabled?: boolean;
  isSystem?: boolean;
  version?: number;
};

export type DefaultPreferenceSeed = {
  eventKey: string;
  enabled?: boolean;
  enabledEmail?: boolean;
  enabledSms?: boolean;
  enabledInApp?: boolean;
  sendToAdmins?: boolean;
  sendToAssignedCrew?: boolean;
  sendToClientContacts?: boolean;
  sendToSiteContacts?: boolean;
  additionalEmails?: string;
  deliveryMode?: 'instant' | 'digest';
  recipientRules?: RecipientRules;
  timing?: TimingRules;
};

export const TRADE_DEFAULT_TEMPLATES: DefaultTemplateSeed[] = [
  {
    key: 'job_assigned',
    channel: 'email',
    name: 'Job assigned (email)',
    subject: 'Job assigned: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'A job has been assigned.\n\n' +
      'Job: {{job.title}}\n' +
      'Client: {{client.name}}\n' +
      'Address: {{job.address}}\n' +
      'Scheduled: {{job.scheduledStart}}\n' +
      'Crew: {{crewSummary}}\n' +
      'Status: {{job.status}}\n\n' +
      'View job: {{links.appEntityUrl}}\n' +
      'Map: {{links.mapsUrl}}\n',
  },
  {
    key: 'job_assigned',
    channel: 'in_app',
    name: 'Job assigned (in-app)',
    body: 'Assigned: {{job.title}} on {{job.scheduledStart}}.',
  },
  {
    key: 'job_created',
    channel: 'email',
    name: 'Job created (email)',
    subject: 'Job created: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'A new job has been created.\n\n' +
      'Job: {{job.title}}\n' +
      'Client: {{client.name}}\n' +
      'Address: {{job.address}}\n' +
      'Status: {{job.status}}\n\n' +
      'View job: {{links.appEntityUrl}}\n',
  },
  {
    key: 'job_created',
    channel: 'in_app',
    name: 'Job created (in-app)',
    body: 'Job created: {{job.title}}.',
  },
  {
    key: 'job_status_changed',
    channel: 'email',
    name: 'Job status changed (email)',
    subject: 'Job status updated: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Job status updated.\n\n' +
      'Job: {{job.title}}\n' +
      'Status: {{job.status}}\n' +
      'Previous status: {{previousStatus}}\n\n' +
      'View job: {{links.appEntityUrl}}\n',
  },
  {
    key: 'job_status_changed',
    channel: 'in_app',
    name: 'Job status changed (in-app)',
    body: 'Job status updated: {{job.title}} -> {{job.status}}.',
  },
  {
    key: 'job_scheduled',
    channel: 'email',
    name: 'Job scheduled (email)',
    subject: 'Job scheduled: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your job has been scheduled.\n\n' +
      'Job: {{job.title}}\n' +
      'Address: {{job.address}}\n' +
      'Scheduled: {{job.scheduledStart}}\n' +
      'Crew: {{crewSummary}}\n\n' +
      'View job: {{links.appEntityUrl}}\n' +
      'Map: {{links.mapsUrl}}\n',
  },
  {
    key: 'job_scheduled',
    channel: 'in_app',
    name: 'Job scheduled (in-app)',
    body: 'Job scheduled: {{job.title}} on {{job.scheduledStart}}.',
  },
  {
    key: 'job_rescheduled',
    channel: 'email',
    name: 'Job rescheduled (email)',
    subject: 'Job rescheduled: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your job schedule has been updated.\n\n' +
      'Job: {{job.title}}\n' +
      'Address: {{job.address}}\n' +
      'New time: {{job.scheduledStart}}\n\n' +
      'View job: {{links.appEntityUrl}}\n' +
      'Map: {{links.mapsUrl}}\n',
  },
  {
    key: 'job_rescheduled',
    channel: 'in_app',
    name: 'Job rescheduled (in-app)',
    body: 'Job rescheduled: {{job.title}} now at {{job.scheduledStart}}.',
  },
  {
    key: 'job_cancelled',
    channel: 'email',
    name: 'Job cancelled (email)',
    subject: 'Job cancelled: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'The following job has been cancelled:\n\n' +
      'Job: {{job.title}}\n' +
      'Address: {{job.address}}\n\n' +
      'If you have questions, reply to this email.',
  },
  {
    key: 'job_cancelled',
    channel: 'in_app',
    name: 'Job cancelled (in-app)',
    body: 'Job cancelled: {{job.title}}.',
  },
  {
    key: 'job_completed',
    channel: 'email',
    name: 'Job completed (email)',
    subject: 'Job completed: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your job has been completed.\n\n' +
      'Job: {{job.title}}\n' +
      'Address: {{job.address}}\n' +
      'Completed: {{job.completedAt}}\n\n' +
      'Thanks for choosing {{org.name}}.',
  },
  {
    key: 'job_completed',
    channel: 'in_app',
    name: 'Job completed (in-app)',
    body: 'Job completed: {{job.title}}.',
  },
  {
    key: 'job_progress_updated',
    channel: 'in_app',
    name: 'Job progress updated (in-app)',
    body: '{{progress.message}}',
  },
  {
    key: 'announcement_published',
    channel: 'email',
    name: 'Announcement published (email)',
    subject: 'Announcement: {{announcement.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      '{{announcement.title}}\n\n' +
      '{{announcement.body}}\n\n' +
      'Published: {{announcement.publishedAt}}\n',
  },
  {
    key: 'announcement_published',
    channel: 'in_app',
    name: 'Announcement published (in-app)',
    body: 'Announcement: {{announcement.title}}',
  },
  {
    key: 'daily_crew_digest',
    channel: 'email',
    name: 'Daily crew digest (email)',
    subject: "Today's Jobs - {{digest.dayName}} {{digest.dateLabel}}",
    body:
      'Good morning {{recipient.name}},\n\n' +
      'Here is your schedule for {{digest.dayName}} {{digest.dateLabel}}.\n\n' +
      '{{digest.jobsText}}\n\n' +
      'Total jobs: {{digest.totalJobs}}\n\n' +
      'Reply to this email if something looks wrong.',
    bodyHtml:
      '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;">' +
      '<div style="font-size: 18px; font-weight: 600; margin-bottom: 6px;">Today&#39;s Jobs</div>' +
      '<div style="color: #6b7280; margin-bottom: 16px;">Hi {{recipient.name}}, here is your schedule for {{digest.dayName}} {{digest.dateLabel}}.</div>' +
      '<div style="margin-bottom: 10px;"><strong>{{digest.totalJobs}}</strong> jobs assigned.</div>' +
      '{{digest.jobsHtml}}' +
      '<div style="margin-top: 18px; color: #6b7280; font-size: 13px;">Reply to this email if something looks wrong.</div>' +
      '</div>',
    version: 2,
  },
  {
    key: 'invoice_sent',
    channel: 'email',
    name: 'Invoice sent (email)',
    subject: 'Invoice {{invoice.number}} from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your invoice is ready.\n\n' +
      'Invoice: {{invoice.number}}\n' +
      'Amount: {{invoice.total}}\n' +
      'Due: {{invoice.dueDate}}\n\n' +
      'View invoice: {{invoice.pdfUrl}}\n' +
      'Pay now: {{invoice.paymentUrl}}\n',
  },
  {
    key: 'invoice_issued',
    channel: 'email',
    name: 'Invoice issued (email)',
    subject: 'Invoice {{invoice.number}} from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your invoice is ready.\n\n' +
      'Invoice: {{invoice.number}}\n' +
      'Amount: {{invoice.total}}\n' +
      'Due: {{invoice.dueDate}}\n\n' +
      'View invoice: {{invoice.pdfUrl}}\n' +
      'Pay now: {{invoice.paymentUrl}}\n',
  },
  {
    key: 'invoice_issued',
    channel: 'in_app',
    name: 'Invoice issued (in-app)',
    body: 'Invoice {{invoice.number}} issued for {{invoice.total}}.',
  },
  {
    key: 'payment_link_sent',
    channel: 'email',
    name: 'Payment link sent (email)',
    subject: 'Payment link for {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Here is your payment link:\n' +
      '{{payment.paymentUrl}}\n\n' +
      'Job: {{job.title}}\n' +
      'Amount: {{payment.amount}}\n',
  },
  {
    key: 'payment_received',
    channel: 'email',
    name: 'Payment received (email)',
    subject: 'Payment received for {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Payment received.\n\n' +
      'Job: {{job.title}}\n' +
      'Amount: {{payment.amount}}\n' +
      'Status: {{payment.status}}\n',
  },
  {
    key: 'payment_recorded',
    channel: 'email',
    name: 'Payment recorded (email)',
    subject: 'Payment recorded for {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'An external payment was recorded.\n\n' +
      'Job: {{job.title}}\n' +
      'Amount: {{payment.amount}}\n' +
      'Method: {{payment.method}}\n' +
      'Reference: {{payment.reference}}\n',
  },
  {
    key: 'payment_recorded',
    channel: 'in_app',
    name: 'Payment recorded (in-app)',
    body: 'Payment recorded for {{job.title}}.',
  },
  {
    key: 'invoice_paid',
    channel: 'email',
    name: 'Invoice paid (email)',
    subject: 'Invoice {{invoice.number}} paid',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Invoice paid.\n\n' +
      'Invoice: {{invoice.number}}\n' +
      'Amount: {{invoice.total}}\n' +
      'Paid at: {{invoice.paidAt}}\n',
  },
  {
    key: 'invoice_paid',
    channel: 'in_app',
    name: 'Invoice paid (in-app)',
    body: 'Invoice {{invoice.number}} has been paid.',
  },
  {
    key: 'invoice_overdue',
    channel: 'email',
    name: 'Invoice overdue (email)',
    subject: 'Invoice {{invoice.number}} is overdue',
    body:
      'Hi {{recipient.name}},\n\n' +
      'This is a reminder that your invoice is overdue.\n\n' +
      'Invoice: {{invoice.number}}\n' +
      'Amount: {{invoice.total}}\n' +
      'Due: {{invoice.dueDate}}\n\n' +
      'Pay now: {{invoice.paymentUrl}}\n',
  },
  {
    key: 'invoice_overdue',
    channel: 'in_app',
    name: 'Invoice overdue (in-app)',
    body: 'Invoice {{invoice.number}} is overdue.',
  },
  {
    key: 'payment_received',
    channel: 'in_app',
    name: 'Payment received (in-app)',
    body: 'Payment received for {{job.title}}.',
  },
  {
    key: 'integration_sync_failed',
    channel: 'email',
    name: 'Integration sync failed (email)',
    subject: 'Integration sync failed: {{integration.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'An integration sync failed.\n\n' +
      'Integration: {{integration.name}}\n' +
      'Error: {{integration.error}}\n' +
      'Time: {{now}}\n',
  },
  {
    key: 'integration_sync_failed',
    channel: 'in_app',
    name: 'Integration sync failed (in-app)',
    body: 'Integration sync failed: {{integration.name}}.',
  },
  {
    key: 'material_alert',
    channel: 'in_app',
    name: 'Material alert (in-app)',
    body: '{{alert.message}}',
  },
  {
    key: 'system_test_email',
    channel: 'email',
    name: 'System test (email)',
    subject: 'Test email from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'This is a test email from {{org.name}}.\n\n' +
      'If you received this message, your email settings are working.\n',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'email',
    name: 'Automation customer notify (email)',
    subject: 'Update from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'We have an update from {{org.name}}.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'sms',
    name: 'Automation customer notify (sms)',
    body: 'Update from {{org.name}}. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'in_app',
    name: 'Automation customer notify (in-app)',
    body: 'Update from {{org.name}}.',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'email',
    name: 'Automation admin notify (email)',
    subject: 'Automation alert: {{automation.ruleName}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Automation "{{automation.ruleName}}" ran for {{automation.triggerKey}}.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'sms',
    name: 'Automation admin notify (sms)',
    body: 'Automation "{{automation.ruleName}}" ran. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'in_app',
    name: 'Automation admin notify (in-app)',
    body: 'Automation "{{automation.ruleName}}" ran.',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'email',
    name: 'Automation crew notify (email)',
    subject: 'Update: {{job.title}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'There is an update related to {{job.title}}.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'sms',
    name: 'Automation crew notify (sms)',
    body: 'Update for {{job.title}}. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'in_app',
    name: 'Automation crew notify (in-app)',
    body: 'Update for {{job.title}}.',
  },
];

export const REAL_ESTATE_DEFAULT_TEMPLATES: DefaultTemplateSeed[] = [
  {
    key: 'vendor_report_ready',
    channel: 'email',
    name: 'Vendor report ready (email)',
    subject: 'Vendor report ready for {{listing.addressLine1}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Your vendor report is ready to share.\n\n' +
      'Listing: {{listing.addressLine1}}, {{listing.suburb}}\n' +
      'Campaign health: {{listing.campaignHealthScore}}\n\n' +
      'Open report: {{links.appEntityUrl}}\n',
  },
  {
    key: 'vendor_report_ready',
    channel: 'in_app',
    name: 'Vendor report ready (in-app)',
    body: 'Vendor report ready for {{listing.addressLine1}}.',
  },
  {
    key: 'vendor_update_reminder',
    channel: 'email',
    name: 'Vendor update reminder (email)',
    subject: 'Vendor update due for {{listing.addressLine1}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'A vendor update is due.\n\n' +
      'Listing: {{listing.addressLine1}}, {{listing.suburb}}\n' +
      'Last update: {{listing.reportLastSentAt}}\n\n' +
      'Open listing: {{links.appEntityUrl}}\n',
  },
  {
    key: 'vendor_update_reminder',
    channel: 'in_app',
    name: 'Vendor update reminder (in-app)',
    body: 'Vendor update due for {{listing.addressLine1}}.',
  },
  {
    key: 'appraisal_confirmation',
    channel: 'email',
    name: 'Appraisal confirmation (email)',
    subject: 'Appraisal confirmed: {{appraisal.appointmentAt}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Appraisal appointment confirmed.\n\n' +
      'Contact: {{contact.fullName}}\n' +
      'When: {{appraisal.appointmentAt}}\n' +
      'Address: {{appraisal.address}}\n\n' +
      'Open appraisal: {{links.appEntityUrl}}\n',
  },
  {
    key: 'appraisal_confirmation',
    channel: 'in_app',
    name: 'Appraisal confirmation (in-app)',
    body: 'Appraisal confirmed for {{contact.fullName}}.',
  },
  {
    key: 'appraisal_followup',
    channel: 'email',
    name: 'Appraisal follow-up (email)',
    subject: 'Appraisal follow-up due for {{contact.fullName}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'An appraisal follow-up is due.\n\n' +
      'Contact: {{contact.fullName}}\n' +
      'Stage: {{appraisal.stage}}\n\n' +
      'Open appraisal: {{links.appEntityUrl}}\n',
  },
  {
    key: 'appraisal_followup',
    channel: 'in_app',
    name: 'Appraisal follow-up (in-app)',
    body: 'Appraisal follow-up due for {{contact.fullName}}.',
  },
  {
    key: 'hot_seller_nurture',
    channel: 'email',
    name: 'Hot seller nurture (email)',
    subject: 'Hot seller intent: {{contact.fullName}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'A contact has crossed into hot seller intent.\n\n' +
      'Contact: {{contact.fullName}}\n' +
      'Next touch: {{contact.nextTouchAt}}\n\n' +
      'Open contact: {{links.appEntityUrl}}\n',
  },
  {
    key: 'hot_seller_nurture',
    channel: 'in_app',
    name: 'Hot seller nurture (in-app)',
    body: 'Hot seller intent: {{contact.fullName}}.',
  },
  {
    key: 'general_contact_nurture',
    channel: 'email',
    name: 'General contact nurture (email)',
    subject: 'Contact nurture reminder',
    body:
      'Hi {{recipient.name}},\n\n' +
      'A contact follow-up is due.\n\n' +
      'Contact: {{contact.fullName}}\n' +
      'Next touch: {{contact.nextTouchAt}}\n\n' +
      'Open contact: {{links.appEntityUrl}}\n',
  },
  {
    key: 'general_contact_nurture',
    channel: 'in_app',
    name: 'General contact nurture (in-app)',
    body: 'Contact follow-up due for {{contact.fullName}}.',
  },
  {
    key: 'announcement_published',
    channel: 'in_app',
    name: 'Announcement published (in-app)',
    body: 'Announcement: {{announcement.title}}',
  },
  {
    key: 'system_test_email',
    channel: 'email',
    name: 'System test (email)',
    subject: 'Test email from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'This is a test email from {{org.name}}.\n\n' +
      'If you received this message, your email settings are working.\n',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'email',
    name: 'Automation customer notify (email)',
    subject: 'Update from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'We have an update from {{org.name}}.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'sms',
    name: 'Automation customer notify (sms)',
    body: 'Update from {{org.name}}. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.customer_notify_generic',
    channel: 'in_app',
    name: 'Automation customer notify (in-app)',
    body: 'Update from {{org.name}}.',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'email',
    name: 'Automation admin notify (email)',
    subject: 'Automation alert: {{automation.ruleName}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'Automation "{{automation.ruleName}}" ran for {{automation.triggerKey}}.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'sms',
    name: 'Automation admin notify (sms)',
    body: 'Automation "{{automation.ruleName}}" ran. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.admin_notify_generic',
    channel: 'in_app',
    name: 'Automation admin notify (in-app)',
    body: 'Automation "{{automation.ruleName}}" ran.',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'email',
    name: 'Automation staff notify (email)',
    subject: 'Update from {{org.name}}',
    body:
      'Hi {{recipient.name}},\n\n' +
      'There is an update related to your pipeline.\n\n' +
      'View details: {{links.appEntityUrl}}\n',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'sms',
    name: 'Automation staff notify (sms)',
    body: 'Update from {{org.name}}. {{links.appEntityUrl}}',
  },
  {
    key: 'automation.crew_notify_generic',
    channel: 'in_app',
    name: 'Automation staff notify (in-app)',
    body: 'Update from {{org.name}}.',
  },
];

export const TRADE_DEFAULT_PREFERENCES: DefaultPreferenceSeed[] = [
  {
    eventKey: 'job_assigned',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_created',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_status_changed',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_scheduled',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_rescheduled',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_cancelled',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_completed',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_assigned_staff: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'job_progress_updated',
    enabledEmail: false,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_all_staff: true },
  },
  {
    eventKey: 'announcement_published',
    enabledEmail: false,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_all_staff: true },
  },
  {
    eventKey: 'daily_crew_digest',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: false,
    recipientRules: { to_assigned_staff: true },
  },
  {
    eventKey: 'invoice_sent',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'invoice_issued',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'payment_link_sent',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'payment_received',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'payment_recorded',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'invoice_paid',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'invoice_overdue',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_client: true, to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'integration_sync_failed',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager'] },
  },
  {
    eventKey: 'material_alert',
    enabledEmail: false,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_all_staff: true },
  },
  {
    eventKey: 'system_test_email',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: false,
    recipientRules: {},
  },
  {
    eventKey: 'automation.customer_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
  {
    eventKey: 'automation.admin_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
  {
    eventKey: 'automation.crew_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
];

export const REAL_ESTATE_DEFAULT_PREFERENCES: DefaultPreferenceSeed[] = [
  {
    eventKey: 'vendor_report_ready',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'vendor_update_reminder',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'appraisal_confirmation',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'appraisal_followup',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'hot_seller_nurture',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'general_contact_nurture',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_roles: ['admin', 'manager', 'staff'] },
  },
  {
    eventKey: 'announcement_published',
    enabledEmail: false,
    enabledSms: false,
    enabledInApp: true,
    recipientRules: { to_all_staff: true },
  },
  {
    eventKey: 'system_test_email',
    enabledEmail: true,
    enabledSms: false,
    enabledInApp: false,
    recipientRules: {},
  },
  {
    eventKey: 'automation.customer_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
  {
    eventKey: 'automation.admin_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
  {
    eventKey: 'automation.crew_notify_generic',
    enabledEmail: true,
    enabledSms: true,
    enabledInApp: true,
    recipientRules: {},
  },
];

function getCommDefaults() {
  const edition = getAppEdition();
  return edition === 'trades'
    ? { templates: TRADE_DEFAULT_TEMPLATES, preferences: TRADE_DEFAULT_PREFERENCES }
    : { templates: REAL_ESTATE_DEFAULT_TEMPLATES, preferences: REAL_ESTATE_DEFAULT_PREFERENCES };
}

export const DEFAULT_TEMPLATES = getCommDefaults().templates;
export const DEFAULT_PREFERENCES = getCommDefaults().preferences;
