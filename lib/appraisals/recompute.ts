import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { appraisals } from '@/db/schema/appraisals';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { tags } from '@/db/schema/tags';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { scoreWinProbability } from '@/lib/appraisals/score';

export async function recomputeWinProbability(params: {
  orgId: string;
  appraisalId: string;
}) {
  const db = getDb();

  const [appraisal] = await db
    .select({
      id: appraisals.id,
      appointmentAt: appraisals.appointmentAt,
      stage: appraisals.stage,
      motivation: appraisals.motivation,
      timeline: appraisals.timeline,
      priceExpectationMin: appraisals.priceExpectationMin,
      priceExpectationMax: appraisals.priceExpectationMax,
      decisionMakersPresent: appraisals.decisionMakersPresent,
      objections: appraisals.objections,
      outcomeStatus: appraisals.outcomeStatus,
      contactId: appraisals.contactId,
    })
    .from(appraisals)
    .where(and(eq(appraisals.orgId, params.orgId), eq(appraisals.id, params.appraisalId)))
    .limit(1);

  if (!appraisal) return null;

  const [contact] = await db
    .select({
      leadSource: contacts.leadSource,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, params.orgId), eq(contacts.id, appraisal.contactId)))
    .limit(1);

  const tagRows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, appraisal.contactId));

  const checklistRows = await db
    .select({
      isDone: appraisalChecklistItems.isDone,
      dueAt: appraisalChecklistItems.dueAt,
    })
    .from(appraisalChecklistItems)
    .where(and(eq(appraisalChecklistItems.orgId, params.orgId), eq(appraisalChecklistItems.appraisalId, params.appraisalId)));

  const [followupRow] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(appraisalFollowups)
    .where(and(eq(appraisalFollowups.orgId, params.orgId), eq(appraisalFollowups.appraisalId, params.appraisalId)));

  const now = new Date();

  const result = scoreWinProbability(
    {
      appointmentAt: appraisal.appointmentAt ?? null,
      stage: appraisal.stage,
      motivation: appraisal.motivation ?? null,
      timeline: appraisal.timeline ?? null,
      priceExpectationMin: appraisal.priceExpectationMin ?? null,
      priceExpectationMax: appraisal.priceExpectationMax ?? null,
      decisionMakersPresent: Boolean(appraisal.decisionMakersPresent),
      objections: appraisal.objections as string[] | string | null,
      outcomeStatus: appraisal.outcomeStatus,
    },
    checklistRows.map((item) => ({
      isDone: item.isDone,
      dueAt: item.dueAt ?? null,
    })),
    {
      leadSource: contact?.leadSource ?? null,
      tags: tagRows.map((tag) => tag.name),
    },
    Number(followupRow?.total ?? 0),
    now
  );

  await db
    .update(appraisals)
    .set({
      winProbabilityScore: result.score,
      winProbabilityReasons: result.reasons,
      updatedAt: new Date(),
    })
    .where(and(eq(appraisals.orgId, params.orgId), eq(appraisals.id, params.appraisalId)));

  return result;
}
