import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { contacts } from './contacts';
import { users } from './users';

export const appraisalStageEnum = pgEnum('appraisal_stage', [
  'booked',
  'confirmed',
  'prepped',
  'attended',
  'followup_sent',
  'won',
  'lost',
]);

export const appraisalMeetingTypeEnum = pgEnum('appraisal_meeting_type', [
  'in_person',
  'phone',
  'video',
]);

export const appraisalTimelineEnum = pgEnum('appraisal_timeline', [
  'asap',
  'days_30',
  'days_60_90',
  'unsure',
]);

export const appraisalOutcomeStatusEnum = pgEnum('appraisal_outcome_status', [
  'pending',
  'won',
  'lost',
]);

export const appraisalLostReasonEnum = pgEnum('appraisal_lost_reason', [
  'commission',
  'marketing',
  'connection',
  'price_promise',
  'other',
]);

export const appraisals = pgTable(
  'appraisals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    stage: appraisalStageEnum('stage').notNull().default('booked'),
    appointmentAt: timestamp('appointment_at', { withTimezone: true }).notNull(),
    meetingType: appraisalMeetingTypeEnum('meeting_type').notNull().default('in_person'),
    address: text('address'),
    suburb: text('suburb'),
    notes: text('notes'),
    motivation: text('motivation'),
    timeline: appraisalTimelineEnum('timeline'),
    priceExpectationMin: integer('price_expectation_min'),
    priceExpectationMax: integer('price_expectation_max'),
    decisionMakersPresent: boolean('decision_makers_present').notNull().default(false),
    objections: jsonb('objections'),
    outcomeStatus: appraisalOutcomeStatusEnum('outcome_status').notNull().default('pending'),
    lostReason: appraisalLostReasonEnum('lost_reason'),
    lostNotes: text('lost_notes'),
    expectedListDate: timestamp('expected_list_date', { withTimezone: true }),
    expectedPriceGuideMin: integer('expected_price_guide_min'),
    expectedPriceGuideMax: integer('expected_price_guide_max'),
    winProbabilityScore: integer('win_probability_score'),
    winProbabilityReasons: jsonb('win_probability_reasons'),
    attendedAt: timestamp('attended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('appraisals_org_id_idx').on(table.orgId),
    orgStageIdx: index('appraisals_org_stage_idx').on(table.orgId, table.stage),
    orgContactIdx: index('appraisals_org_contact_idx').on(table.orgId, table.contactId),
    orgOwnerIdx: index('appraisals_org_owner_idx').on(table.orgId, table.ownerUserId),
  })
);

export type Appraisal = typeof appraisals.$inferSelect;
export type NewAppraisal = typeof appraisals.$inferInsert;
