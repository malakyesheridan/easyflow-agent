import { pgTable, uuid, text, integer, boolean, timestamp, index, numeric, jsonb } from 'drizzle-orm/pg-core';

/**
 * Org-scoped settings.
 * Keep defaults safe, and allow NULL to indicate "use app defaults".
 */
export const orgSettings = pgTable(
  'org_settings',
  {
    orgId: uuid('org_id').primaryKey(),

    companyName: text('company_name'),
    companyLogoPath: text('company_logo_path'),
    timezone: text('timezone'),
    businessType: text('business_type'),
    officeType: text('office_type'),
    reportCadence: text('report_cadence'),
    serviceAreaSuburbs: jsonb('service_area_suburbs').notNull().default([]),
    buyerIntakePublicEnabled: boolean('buyer_intake_public_enabled').notNull().default(false),
    buyerIntakeManualEnabled: boolean('buyer_intake_manual_enabled').notNull().default(true),
    listingStatusOptions: jsonb('listing_status_options').notNull().default([]),

    defaultWorkdayStartMinutes: integer('default_workday_start_minutes'),
    defaultWorkdayEndMinutes: integer('default_workday_end_minutes'),
    defaultDailyCapacityMinutes: integer('default_daily_capacity_minutes'),
    defaultJobDurationMinutes: integer('default_job_duration_minutes'),
    defaultTravelBufferMinutes: integer('default_travel_buffer_minutes'),

    travelBufferEnabled: boolean('travel_buffer_enabled').notNull().default(true),

    announcementsEnabled: boolean('announcements_enabled').notNull().default(true),
    urgentAnnouncementBehavior: text('urgent_announcement_behavior').notNull().default('modal'), // 'modal' | 'banner'
    vocabulary: text('vocabulary'),
    units: text('units'),
    kpiUnits: text('kpi_units'),
    commFromName: text('comm_from_name'),
    commFromEmail: text('comm_from_email'),
    commReplyToEmail: text('comm_reply_to_email'),
    automationsDisabled: boolean('automations_disabled').notNull().default(false),
    xeroSyncPaymentsEnabled: boolean('xero_sync_payments_enabled').notNull().default(false),
    xeroSalesAccountCode: text('xero_sales_account_code'),
    xeroTaxType: text('xero_tax_type'),
    marginWarningPercent: numeric('margin_warning_percent', { precision: 5, scale: 2 }),
    marginCriticalPercent: numeric('margin_critical_percent', { precision: 5, scale: 2 }),
    varianceThresholdPercent: numeric('variance_threshold_percent', { precision: 5, scale: 2 }),
    lateRiskMinutes: integer('late_risk_minutes'),
    idleThresholdMinutes: integer('idle_threshold_minutes'),
    staleLocationMinutes: integer('stale_location_minutes'),
    riskRadiusKm: numeric('risk_radius_km', { precision: 6, scale: 2 }),
    installProductivityV2Enabled: boolean('install_productivity_v2_enabled').notNull().default(true),
    qualityCallbackDays: integer('quality_callback_days').notNull().default(30),
    hqAddressLine1: text('hq_address_line1'),
    hqAddressLine2: text('hq_address_line2'),
    hqSuburb: text('hq_suburb'),
    hqState: text('hq_state'),
    hqPostcode: text('hq_postcode'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('org_settings_org_id_idx').on(table.orgId),
  })
);

export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;
