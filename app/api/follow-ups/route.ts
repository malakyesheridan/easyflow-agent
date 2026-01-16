import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { contactActivities } from '@/db/schema/contact_activities';
import { tags } from '@/db/schema/tags';
import { appraisals } from '@/db/schema/appraisals';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listings } from '@/db/schema/listings';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { listingReports } from '@/db/schema/listing_reports';
import { followupSnoozes } from '@/db/schema/followup_snoozes';
import { scoreSellerIntent } from '@/lib/prospecting/score';

type FollowUpMode = 'daily' | 'weekly' | 'monthly';
type CategoryKey = 'prospecting' | 'appraisals' | 'listings' | 'vendor_reporting' | 'buyer_followups';

type ActionItem = {
  source_type: string;
  source_id: string;
  title: string;
  due_at: string | null;
  category: CategoryKey;
  priority_score: number;
  priority_label: 'Critical' | 'High' | 'Normal';
  reason: string;
  entity_type: 'contact' | 'appraisal' | 'listing' | 'report';
  entity_id: string;
  entity_label: string;
  deep_link: string;
  context: {
    seller_intent_score: number | null;
    win_probability: number | null;
    campaign_health: number | null;
  };
  state: {
    is_completed: boolean;
    is_snoozed: boolean;
  };
  actions_allowed: {
    can_complete: boolean;
    can_snooze: boolean;
    can_open: boolean;
  };
};

type Group = {
  key: string;
  label: string;
  items: ActionItem[];
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  prospecting: 'Prospecting',
  appraisals: 'Appraisals',
  listings: 'Listings',
  vendor_reporting: 'Vendor Reporting',
  buyer_followups: 'Buyer Follow-ups',
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toISOString(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isTomorrow(date: Date, now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

function getRangeEnd(now: Date, mode: FollowUpMode) {
  const base = startOfDay(now);
  const days = mode === 'daily' ? 0 : mode === 'weekly' ? 6 : 29;
  base.setDate(base.getDate() + days);
  return endOfDay(base);
}

function getPriorityLabel(score: number): ActionItem['priority_label'] {
  if (score >= 80) return 'Critical';
  if (score >= 55) return 'High';
  return 'Normal';
}

function getDueBoost(dueAt: Date, now: Date) {
  if (dueAt.getTime() < now.getTime()) return 50;
  if (isSameDay(dueAt, now)) return 35;
  if (isTomorrow(dueAt, now)) return 20;
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() + 7);
  if (dueAt.getTime() <= sevenDays.getTime()) return 10;
  return 0;
}

function scorePriority(item: Omit<ActionItem, 'priority_score' | 'priority_label'>, now: Date): number {
  const dueAt = item.due_at ? new Date(item.due_at) : null;
  let score = 0;

  if (dueAt) {
    score += getDueBoost(dueAt, now);
  }

  if (item.context.seller_intent_score !== null) {
    score += Math.round((item.context.seller_intent_score / 100) * 20);
  }

  if (item.context.win_probability !== null) {
    score += Math.round((item.context.win_probability / 100) * 20);
  }

  if (item.context.campaign_health !== null) {
    score += Math.round(((100 - item.context.campaign_health) / 100) * 20);
  }

  if (item.source_type === 'vendor_report_due') score += 25;
  if (item.source_type === 'appraisal_followup') score += 20;
  if (item.source_type === 'buyer_followup') score += 15;

  return Math.max(0, Math.min(100, score));
}

function buildReason(item: ActionItem, now: Date): string {
  const dueAt = item.due_at ? new Date(item.due_at) : null;
  const overdue = dueAt ? dueAt.getTime() < now.getTime() : false;

  if (item.source_type === 'vendor_report_due') {
    return overdue
      ? 'Vendor update is overdue, keep the listing relationship strong.'
      : 'Vendor report due to maintain confidence and momentum.';
  }

  if (item.source_type === 'vendor_comm_overdue') {
    return 'Vendor update overdue, the campaign cadence is slipping.';
  }

  if (item.source_type === 'appraisal_followup') {
    if ((item.context.win_probability ?? 0) >= 70) {
      return overdue
        ? 'Appraisal follow-up overdue with strong win potential.'
        : 'Appraisal follow-up due with strong win potential.';
    }
    return overdue ? 'Appraisal follow-up overdue, keep momentum.' : 'Appraisal follow-up due, keep momentum.';
  }

  if (item.source_type === 'appraisal_checklist_item') {
    return overdue ? 'Prep item overdue, keep the appraisal on track.' : 'Prep item due for the appraisal.';
  }

  if (item.source_type === 'contact_followup') {
    const intent = item.context.seller_intent_score ?? 0;
    if (intent >= 80) {
      return overdue ? 'Overdue follow-up on a hot potential seller.' : 'Follow-up due for a hot potential seller.';
    }
    if (intent >= 50) {
      return overdue ? 'Overdue follow-up on a warm prospect.' : 'Follow-up due for a warm prospect.';
    }
    return overdue ? 'Overdue follow-up, keep the relationship warm.' : 'Follow-up due, keep the relationship warm.';
  }

  if (item.source_type === 'listing_checklist_item') {
    if ((item.context.campaign_health ?? 100) < 40) {
      return overdue ? 'Listing health is slipping, task overdue.' : 'Listing health is slipping, task due soon.';
    }
    return overdue ? 'Listing task overdue, keep the campaign on track.' : 'Listing task due, keep the campaign on track.';
  }

  if (item.source_type === 'listing_milestone') {
    return overdue ? 'Milestone overdue, campaign timing is at risk.' : 'Milestone due, keep the campaign moving.';
  }

  if (item.source_type === 'buyer_followup') {
    return overdue ? 'Buyer follow-up overdue, keep interest warm.' : 'Buyer follow-up due, keep interest warm.';
  }

  return overdue ? 'Overdue follow-up, keep momentum.' : 'Follow-up due soon.';
}
function buildGroups(mode: FollowUpMode, items: ActionItem[], now: Date): Group[] {
  if (mode === 'daily') {
    const grouped = new Map<CategoryKey, ActionItem[]>();
    items.forEach((item) => {
      const current = grouped.get(item.category) ?? [];
      current.push(item);
      grouped.set(item.category, current);
    });
    return Array.from(grouped.entries()).map(([key, values]) => ({
      key,
      label: CATEGORY_LABELS[key],
      items: values,
    }));
  }

  const overdueItems = items.filter((item) => item.due_at && new Date(item.due_at).getTime() < now.getTime());
  const upcomingItems = items.filter((item) => !item.due_at || new Date(item.due_at).getTime() >= now.getTime());

  const groups: Group[] = [];
  if (overdueItems.length > 0) {
    groups.push({ key: 'overdue', label: 'Overdue', items: overdueItems });
  }

  const map = new Map<string, ActionItem[]>();
  upcomingItems.forEach((item) => {
    const dueAt = item.due_at ? new Date(item.due_at) : now;
    if (mode === 'weekly') {
      const label = dueAt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      const key = dueAt.toISOString().slice(0, 10);
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
      if (!groups.find((group) => group.key === key)) {
        groups.push({ key, label, items: [] });
      }
      return;
    }

    const start = new Date(dueAt);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const key = start.toISOString().slice(0, 10);
    const label = `Week of ${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
    const current = map.get(key) ?? [];
    current.push(item);
    map.set(key, current);
    if (!groups.find((group) => group.key === key)) {
      groups.push({ key, label, items: [] });
    }
  });

  return groups.map((group) => ({ ...group, items: map.get(group.key) ?? group.items }));
}

function applyFilters(
  items: ActionItem[],
  filters: {
    category?: string;
    priority?: string;
    overdueOnly?: boolean;
    search?: string;
  },
  now: Date
) {
  let filtered = items;

  if (filters.category) {
    filtered = filtered.filter((item) => item.category === filters.category);
  }

  if (filters.priority) {
    filtered = filtered.filter((item) => item.priority_label.toLowerCase() === filters.priority?.toLowerCase());
  }

  if (filters.overdueOnly) {
    filtered = filtered.filter((item) => item.due_at && new Date(item.due_at).getTime() < now.getTime());
  }

  if (filters.search) {
    const searchValue = filters.search.toLowerCase();
    filtered = filtered.filter((item) => item.entity_label.toLowerCase().includes(searchValue) || item.title.toLowerCase().includes(searchValue));
  }

  return filtered;
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const modeParam = searchParams.get('mode')?.toLowerCase() ?? 'daily';
  const mode: FollowUpMode = modeParam === 'weekly' || modeParam === 'monthly' ? modeParam : 'daily';
  const ownerFilter = searchParams.get('owner')?.toLowerCase() ?? 'any';
  const categoryFilter = searchParams.get('category')?.trim() ?? '';
  const priorityFilter = searchParams.get('priority')?.trim() ?? '';
  const overdueOnly = searchParams.get('overdue') === 'true';
  const search = searchParams.get('search')?.trim() ?? '';

  const now = new Date();
  const rangeEnd = getRangeEnd(now, mode);
  const db = getDb();
  const actorUserId = context.data.actor.userId ?? null;

  const snoozeRows = await db
    .select({
      sourceType: followupSnoozes.sourceType,
      sourceId: followupSnoozes.sourceId,
      snoozedUntil: followupSnoozes.snoozedUntil,
    })
    .from(followupSnoozes)
    .where(and(eq(followupSnoozes.orgId, context.data.orgId), gte(followupSnoozes.snoozedUntil, now)));

  const snoozeMap = new Map(
    snoozeRows.map((row) => [`${row.sourceType}:${row.sourceId}`, row.snoozedUntil])
  );

  const actions: ActionItem[] = [];

  const contactConditions = [
    eq(contacts.orgId, context.data.orgId),
    isNotNull(contacts.nextTouchAt),
    lte(contacts.nextTouchAt, rangeEnd),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    contactConditions.push(eq(contacts.ownerUserId, actorUserId));
  }

  const contactRows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      role: contacts.role,
      temperature: contacts.temperature,
      sellerStage: contacts.sellerStage,
      lastTouchAt: contacts.lastTouchAt,
      nextTouchAt: contacts.nextTouchAt,
    })
    .from(contacts)
    .where(and(...contactConditions));

  const contactIds = contactRows.map((row) => String(row.id));

  const tagRows = contactIds.length
    ? await db
        .select({
          contactId: contactTags.contactId,
          name: tags.name,
        })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : [];

  const tagsByContact = new Map<string, string[]>();
  tagRows.forEach((row) => {
    const contactId = String(row.contactId);
    const current = tagsByContact.get(contactId) ?? [];
    current.push(row.name);
    tagsByContact.set(contactId, current);
  });

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const activityRows = contactIds.length
    ? await db
        .select({
          contactId: contactActivities.contactId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(contactActivities)
        .where(
          and(
            eq(contactActivities.orgId, context.data.orgId),
            inArray(contactActivities.contactId, contactIds),
            gte(contactActivities.occurredAt, ninetyDaysAgo)
          )
        )
        .groupBy(contactActivities.contactId)
    : [];

  const activityCounts = new Map(activityRows.map((row) => [String(row.contactId), Number(row.count ?? 0)]));

  contactRows.forEach((row) => {
    const contactId = String(row.id);
    const key = `contact_followup:${contactId}`;
    if (snoozeMap.has(key)) return;
    const tagsForContact = tagsByContact.get(contactId) ?? [];
    const touchCount = activityCounts.get(contactId) ?? 0;
    const { score } = scoreSellerIntent(
      {
        role: row.role,
        temperature: row.temperature,
        sellerStage: row.sellerStage ?? null,
        lastTouchAt: toDate(row.lastTouchAt),
        nextTouchAt: toDate(row.nextTouchAt),
        tags: tagsForContact,
      },
      touchCount,
      now
    );

    actions.push({
      source_type: 'contact_followup',
      source_id: contactId,
      title: `Follow up: ${row.fullName}`,
      due_at: toISOString(row.nextTouchAt),
      category: 'prospecting',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'contact',
      entity_id: contactId,
      entity_label: row.fullName,
      deep_link: `/contacts/${contactId}`,
      context: {
        seller_intent_score: score,
        win_probability: null,
        campaign_health: null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });
  const appraisalChecklistConditions = [
    eq(appraisalChecklistItems.orgId, context.data.orgId),
    eq(appraisalChecklistItems.isDone, false),
    isNotNull(appraisalChecklistItems.dueAt),
    lte(appraisalChecklistItems.dueAt, rangeEnd),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    const ownerCondition = or(
      eq(appraisalChecklistItems.assignedToUserId, actorUserId),
      eq(appraisals.ownerUserId, actorUserId)
    );
    if (ownerCondition) appraisalChecklistConditions.push(ownerCondition);
  }

  const appraisalChecklistRows = await db
    .select({
      id: appraisalChecklistItems.id,
      title: appraisalChecklistItems.title,
      dueAt: appraisalChecklistItems.dueAt,
      appraisalId: appraisalChecklistItems.appraisalId,
      contactName: contacts.fullName,
      winProbability: appraisals.winProbabilityScore,
    })
    .from(appraisalChecklistItems)
    .innerJoin(appraisals, eq(appraisalChecklistItems.appraisalId, appraisals.id))
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .where(and(...appraisalChecklistConditions));

  appraisalChecklistRows.forEach((row) => {
    const sourceId = String(row.id);
    const key = `appraisal_checklist_item:${sourceId}`;
    if (snoozeMap.has(key)) return;
    const appraisalId = String(row.appraisalId);
    actions.push({
      source_type: 'appraisal_checklist_item',
      source_id: sourceId,
      title: `Appraisal prep: ${row.title}`,
      due_at: toISOString(row.dueAt),
      category: 'appraisals',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'appraisal',
      entity_id: appraisalId,
      entity_label: row.contactName ?? 'Appraisal',
      deep_link: `/appraisals/${appraisalId}`,
      context: {
        seller_intent_score: null,
        win_probability: row.winProbability ?? null,
        campaign_health: null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });

  const appraisalFollowupConditions = [
    eq(appraisalFollowups.orgId, context.data.orgId),
    eq(appraisalFollowups.isDone, false),
    lte(appraisalFollowups.dueAt, rangeEnd),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    appraisalFollowupConditions.push(eq(appraisals.ownerUserId, actorUserId));
  }

  const appraisalFollowupRows = await db
    .select({
      id: appraisalFollowups.id,
      title: appraisalFollowups.title,
      dueAt: appraisalFollowups.dueAt,
      appraisalId: appraisalFollowups.appraisalId,
      contactName: contacts.fullName,
      winProbability: appraisals.winProbabilityScore,
    })
    .from(appraisalFollowups)
    .innerJoin(appraisals, eq(appraisalFollowups.appraisalId, appraisals.id))
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .where(and(...appraisalFollowupConditions));

  appraisalFollowupRows.forEach((row) => {
    const sourceId = String(row.id);
    const key = `appraisal_followup:${sourceId}`;
    if (snoozeMap.has(key)) return;
    const appraisalId = String(row.appraisalId);
    actions.push({
      source_type: 'appraisal_followup',
      source_id: sourceId,
      title: `Appraisal follow-up: ${row.title}`,
      due_at: toISOString(row.dueAt),
      category: 'appraisals',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'appraisal',
      entity_id: appraisalId,
      entity_label: row.contactName ?? 'Appraisal',
      deep_link: `/appraisals/${appraisalId}`,
      context: {
        seller_intent_score: null,
        win_probability: row.winProbability ?? null,
        campaign_health: null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });
  const listingChecklistConditions = [
    eq(listingChecklistItems.orgId, context.data.orgId),
    eq(listingChecklistItems.isDone, false),
    isNotNull(listingChecklistItems.dueAt),
    lte(listingChecklistItems.dueAt, rangeEnd),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    const ownerCondition = or(
      eq(listingChecklistItems.assignedToUserId, actorUserId),
      eq(listings.ownerUserId, actorUserId)
    );
    if (ownerCondition) listingChecklistConditions.push(ownerCondition);
  }

  const listingChecklistRows = await db
    .select({
      id: listingChecklistItems.id,
      title: listingChecklistItems.title,
      dueAt: listingChecklistItems.dueAt,
      listingId: listingChecklistItems.listingId,
      address: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealth: listings.campaignHealthScore,
    })
    .from(listingChecklistItems)
    .innerJoin(listings, eq(listingChecklistItems.listingId, listings.id))
    .where(and(...listingChecklistConditions));

  listingChecklistRows.forEach((row) => {
    const sourceId = String(row.id);
    const key = `listing_checklist_item:${sourceId}`;
    if (snoozeMap.has(key)) return;
    const listingId = String(row.listingId);
    const label = `${row.address ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
    actions.push({
      source_type: 'listing_checklist_item',
      source_id: sourceId,
      title: `Listing task: ${row.title}`,
      due_at: toISOString(row.dueAt),
      category: 'listings',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'listing',
      entity_id: listingId,
      entity_label: label,
      deep_link: `/listings/${listingId}?tab=checklist`,
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealth ?? null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });

  const listingMilestoneConditions = [
    eq(listingMilestones.orgId, context.data.orgId),
    isNull(listingMilestones.completedAt),
    isNotNull(listingMilestones.targetDueAt),
    lte(listingMilestones.targetDueAt, rangeEnd),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    const ownerCondition = or(
      eq(listingMilestones.assignedToUserId, actorUserId),
      eq(listings.ownerUserId, actorUserId)
    );
    if (ownerCondition) listingMilestoneConditions.push(ownerCondition);
  }

  const listingMilestoneRows = await db
    .select({
      id: listingMilestones.id,
      name: listingMilestones.name,
      targetDueAt: listingMilestones.targetDueAt,
      listingId: listingMilestones.listingId,
      address: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealth: listings.campaignHealthScore,
    })
    .from(listingMilestones)
    .innerJoin(listings, eq(listingMilestones.listingId, listings.id))
    .where(and(...listingMilestoneConditions));

  listingMilestoneRows.forEach((row) => {
    const sourceId = String(row.id);
    const key = `listing_milestone:${sourceId}`;
    if (snoozeMap.has(key)) return;
    const listingId = String(row.listingId);
    const label = `${row.address ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
    actions.push({
      source_type: 'listing_milestone',
      source_id: sourceId,
      title: `Milestone due: ${row.name}`,
      due_at: toISOString(row.targetDueAt),
      category: 'listings',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'listing',
      entity_id: listingId,
      entity_label: label,
      deep_link: `/listings/${listingId}?tab=milestones`,
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealth ?? null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });

  const buyerFollowupConditions = [
    eq(listingBuyers.orgId, context.data.orgId),
    isNotNull(listingBuyers.nextFollowUpAt),
    lte(listingBuyers.nextFollowUpAt, rangeEnd),
    ne(listingBuyers.status, 'not_interested'),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    buyerFollowupConditions.push(eq(listings.ownerUserId, actorUserId));
  }

  const buyerFollowupRows = await db
    .select({
      id: listingBuyers.id,
      nextFollowUpAt: listingBuyers.nextFollowUpAt,
      status: listingBuyers.status,
      listingId: listingBuyers.listingId,
      buyerName: contacts.fullName,
      address: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealth: listings.campaignHealthScore,
    })
    .from(listingBuyers)
    .innerJoin(listings, eq(listingBuyers.listingId, listings.id))
    .innerJoin(contacts, eq(listingBuyers.buyerContactId, contacts.id))
    .where(and(...buyerFollowupConditions));

  buyerFollowupRows.forEach((row) => {
    const sourceId = String(row.id);
    const key = `buyer_followup:${sourceId}`;
    if (snoozeMap.has(key)) return;
    const listingId = String(row.listingId);
    const label = `${row.address ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
    actions.push({
      source_type: 'buyer_followup',
      source_id: sourceId,
      title: `Buyer follow-up: ${row.buyerName ?? 'Buyer'} re ${label}`,
      due_at: toISOString(row.nextFollowUpAt),
      category: 'buyer_followups',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'listing',
      entity_id: listingId,
      entity_label: label,
      deep_link: `/listings/${listingId}?tab=buyers`,
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealth ?? null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });
  const reportDueConditions = [
    eq(listings.orgId, context.data.orgId),
    eq(listings.reportCadenceEnabled, true),
    ne(listings.reportCadenceType, 'none'),
    isNotNull(listings.reportNextDueAt),
    lte(listings.reportNextDueAt, rangeEnd),
    eq(listings.status, 'active'),
  ];
  if (ownerFilter === 'me' && actorUserId) {
    reportDueConditions.push(eq(listings.ownerUserId, actorUserId));
  }

  const reportDueRows = await db
    .select({
      id: listings.id,
      reportNextDueAt: listings.reportNextDueAt,
      address: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealth: listings.campaignHealthScore,
    })
    .from(listings)
    .where(and(...reportDueConditions));

  const reportDueListingIds = new Set(reportDueRows.map((row) => String(row.id)));

  reportDueRows.forEach((row) => {
    const listingId = String(row.id);
    const key = `vendor_report_due:${listingId}`;
    if (snoozeMap.has(key)) return;
    const label = `${row.address ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
    actions.push({
      source_type: 'vendor_report_due',
      source_id: listingId,
      title: `Send vendor report: ${label}`,
      due_at: toISOString(row.reportNextDueAt),
      category: 'vendor_reporting',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'report',
      entity_id: listingId,
      entity_label: label,
      deep_link: `/listings/${listingId}?tab=reports`,
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealth ?? null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });

  const listingRowsForComms = await db
    .select({
      id: listings.id,
      address: listings.addressLine1,
      suburb: listings.suburb,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      campaignHealth: listings.campaignHealthScore,
      ownerUserId: listings.ownerUserId,
      status: listings.status,
    })
    .from(listings)
    .where(and(eq(listings.orgId, context.data.orgId), eq(listings.status, 'active')));

  const commRows = await db
    .select({
      listingId: listingVendorComms.listingId,
      lastOccurredAt: sql<Date>`max(${listingVendorComms.occurredAt})`.mapWith((value) => value as Date),
    })
    .from(listingVendorComms)
    .where(eq(listingVendorComms.orgId, context.data.orgId))
    .groupBy(listingVendorComms.listingId);

  const commMap = new Map(commRows.map((row) => [String(row.listingId), toDate(row.lastOccurredAt)]));

  listingRowsForComms.forEach((row) => {
    const listingId = String(row.id);
    if (reportDueListingIds.has(listingId)) return;
    if (ownerFilter === 'me' && actorUserId && row.ownerUserId && row.ownerUserId !== actorUserId) return;
    const lastComm = commMap.get(listingId) ?? null;
    const baseDate = lastComm ?? toDate(row.listedAt) ?? toDate(row.createdAt) ?? null;
    if (!baseDate) return;
    const daysSince = (now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince <= 7) return;
    const key = `vendor_comm_overdue:${listingId}`;
    if (snoozeMap.has(key)) return;
    const label = `${row.address ?? 'Listing'}${row.suburb ? `, ${row.suburb}` : ''}`;
    actions.push({
      source_type: 'vendor_comm_overdue',
      source_id: listingId,
      title: `Vendor update overdue: ${label}`,
      due_at: toISOString(baseDate),
      category: 'vendor_reporting',
      priority_score: 0,
      priority_label: 'Normal',
      reason: '',
      entity_type: 'listing',
      entity_id: listingId,
      entity_label: label,
      deep_link: `/listings/${listingId}?tab=vendor-comms`,
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealth ?? null,
      },
      state: { is_completed: false, is_snoozed: false },
      actions_allowed: { can_complete: true, can_snooze: true, can_open: true },
    });
  });
  const scored = actions.map((item) => {
    const score = scorePriority(item, now);
    const label = getPriorityLabel(score);
    return {
      ...item,
      priority_score: score,
      priority_label: label,
      reason: buildReason({ ...item, priority_score: score, priority_label: label }, now),
    };
  });

  const filtered = applyFilters(
    scored,
    {
      category: categoryFilter || undefined,
      priority: priorityFilter || undefined,
      overdueOnly,
      search: search || undefined,
    },
    now
  );

  filtered.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });

  const topActions = filtered.slice(0, mode === 'daily' ? 20 : 10);
  const groups = buildGroups(mode, filtered, now);

  const startToday = startOfDay(now);
  const endToday = endOfDay(now);

  const completedContacts = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, context.data.orgId),
        isNotNull(contacts.lastTouchAt),
        gte(contacts.lastTouchAt, startToday),
        lte(contacts.lastTouchAt, endToday)
      )
    );

  const completedAppraisalChecklist = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(appraisalChecklistItems)
    .where(
      and(
        eq(appraisalChecklistItems.orgId, context.data.orgId),
        eq(appraisalChecklistItems.isDone, true),
        gte(appraisalChecklistItems.updatedAt, startToday),
        lte(appraisalChecklistItems.updatedAt, endToday)
      )
    );

  const completedAppraisalFollowups = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(appraisalFollowups)
    .where(
      and(
        eq(appraisalFollowups.orgId, context.data.orgId),
        eq(appraisalFollowups.isDone, true),
        gte(appraisalFollowups.updatedAt, startToday),
        lte(appraisalFollowups.updatedAt, endToday)
      )
    );

  const completedListingChecklist = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(listingChecklistItems)
    .where(
      and(
        eq(listingChecklistItems.orgId, context.data.orgId),
        eq(listingChecklistItems.isDone, true),
        gte(listingChecklistItems.updatedAt, startToday),
        lte(listingChecklistItems.updatedAt, endToday)
      )
    );

  const completedListingMilestones = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(listingMilestones)
    .where(
      and(
        eq(listingMilestones.orgId, context.data.orgId),
        isNotNull(listingMilestones.completedAt),
        gte(listingMilestones.completedAt, startToday),
        lte(listingMilestones.completedAt, endToday)
      )
    );

  const completedReports = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(listingReports)
    .where(
      and(
        eq(listingReports.orgId, context.data.orgId),
        gte(listingReports.createdAt, startToday),
        lte(listingReports.createdAt, endToday)
      )
    );

  const completedToday =
    Number(completedContacts[0]?.count ?? 0) +
    Number(completedAppraisalChecklist[0]?.count ?? 0) +
    Number(completedAppraisalFollowups[0]?.count ?? 0) +
    Number(completedListingChecklist[0]?.count ?? 0) +
    Number(completedListingMilestones[0]?.count ?? 0) +
    Number(completedReports[0]?.count ?? 0);

  const overdue = filtered.filter((item) => item.due_at && new Date(item.due_at).getTime() < now.getTime()).length;
  const dueToday = filtered.filter((item) => item.due_at && isSameDay(new Date(item.due_at), now)).length;

  const dueThisWeek = filtered.filter((item) => {
    if (!item.due_at) return false;
    const dueAt = new Date(item.due_at);
    const weekEnd = new Date(startToday);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return dueAt.getTime() <= weekEnd.getTime();
  }).length;

  return ok({
    topActions,
    groups,
    summary: {
      overdue,
      dueToday,
      dueThisWeek,
      completedToday,
    },
  });
});
