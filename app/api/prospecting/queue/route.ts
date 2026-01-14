import { and, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { contactActivities } from '@/db/schema/contact_activities';
import { tags } from '@/db/schema/tags';
import { users } from '@/db/schema/users';
import { scoreSellerIntent, type SellerIntentBand } from '@/lib/prospecting/score';

function buildSearchFilter(search: string) {
  const like = `%${search}%`;
  return or(
    ilike(contacts.fullName, like),
    ilike(contacts.email, like),
    ilike(contacts.phone, like),
    ilike(contacts.suburb, like),
    ilike(contacts.address, like)
  );
}

function isBand(value: string): value is SellerIntentBand {
  return value === 'hot' || value === 'warm' || value === 'cold';
}

function getSuggestedAction(
  nextTouchAt: Date | null,
  band: SellerIntentBand,
  now: Date
): string {
  if (nextTouchAt && nextTouchAt.getTime() < now.getTime()) {
    return 'Follow up';
  }
  if (nextTouchAt) {
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 2);
    if (nextTouchAt.getTime() <= soon.getTime()) {
      return 'Follow up';
    }
  }
  if (band === 'hot') return 'Call today';
  if (band === 'warm') return 'Plan follow-up';
  return 'Review';
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const search = searchParams.get('q')?.trim() ?? '';
  const ownerId = searchParams.get('ownerId')?.trim() ?? '';
  const role = searchParams.get('role')?.trim() ?? '';
  const sellerStage = searchParams.get('sellerStage')?.trim() ?? '';
  const tagFilters = searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean);
  const bandFilter = searchParams.get('band')?.trim() ?? '';
  const dueToday = searchParams.get('dueToday') === 'true';
  const overdue = searchParams.get('overdue') === 'true';
  const dueWithinDays = Number(searchParams.get('dueWithinDays') ?? '');
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? 50)));

  const conditions = [eq(contacts.orgId, context.data.orgId)];

  if (search) {
    const filter = buildSearchFilter(search);
    if (filter) conditions.push(filter);
  }

  if (ownerId) {
    conditions.push(eq(contacts.ownerUserId, ownerId));
  }

  if (role === 'seller' || role === 'both') {
    conditions.push(eq(contacts.role, role));
  }

  if (sellerStage) {
    conditions.push(ilike(contacts.sellerStage, `%${sellerStage}%`));
  }

  const now = new Date();

  if (dueToday) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dueCondition = and(
      sql`${contacts.nextTouchAt} >= ${start}`,
      sql`${contacts.nextTouchAt} < ${end}`
    );
    if (dueCondition) conditions.push(dueCondition);
  }

  if (overdue) {
    const overdueCondition = and(
      sql`${contacts.nextTouchAt} < ${now}`,
      sql`${contacts.nextTouchAt} is not null`
    );
    if (overdueCondition) conditions.push(overdueCondition);
  }

  if (!Number.isNaN(dueWithinDays) && dueWithinDays > 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + dueWithinDays);
    const dueWindow = and(
      sql`${contacts.nextTouchAt} >= ${start}`,
      sql`${contacts.nextTouchAt} <= ${end}`
    );
    if (dueWindow) conditions.push(dueWindow);
  }

  const db = getDb();

  if (tagFilters.length > 0) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, context.data.orgId), inArray(tags.name, tagFilters)));

    const tagIds = tagRows.map((row) => String(row.id));
    if (tagIds.length === 0) {
      return ok({ data: [], page, pageSize, total: 0 });
    }

    const contactTagRows = await db
      .select({ contactId: contactTags.contactId })
      .from(contactTags)
      .where(inArray(contactTags.tagId, tagIds));

    const contactIds = Array.from(new Set(contactTagRows.map((row) => String(row.contactId))));
    if (contactIds.length === 0) {
      return ok({ data: [], page, pageSize, total: 0 });
    }
    conditions.push(inArray(contacts.id, contactIds));
  }

  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      suburb: contacts.suburb,
      role: contacts.role,
      sellerStage: contacts.sellerStage,
      temperature: contacts.temperature,
      lastTouchAt: contacts.lastTouchAt,
      nextTouchAt: contacts.nextTouchAt,
      ownerUserId: contacts.ownerUserId,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.ownerUserId, users.id))
    .where(and(...conditions));

  const contactIds = rows.map((row) => String(row.id));

  const tagRows = contactIds.length
    ? await db
        .select({
          contactId: contactTags.contactId,
          tagId: tags.id,
          name: tags.name,
        })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : [];

  const tagsByContact = new Map<string, string[]>();
  tagRows.forEach((row) => {
    const contactId = String(row.contactId);
    const existing = tagsByContact.get(contactId) ?? [];
    existing.push(row.name);
    tagsByContact.set(contactId, existing);
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

  const activityCounts = new Map(
    activityRows.map((row) => [String(row.contactId), Number(row.count ?? 0)])
  );

  const scored = rows.map((row) => {
    const contactId = String(row.id);
    const contactTags = tagsByContact.get(contactId) ?? [];
    const touchCount = activityCounts.get(contactId) ?? 0;
    const { score, band, reasons } = scoreSellerIntent(
      {
        role: row.role,
        temperature: row.temperature,
        sellerStage: row.sellerStage ?? null,
        lastTouchAt: row.lastTouchAt ?? null,
        nextTouchAt: row.nextTouchAt ?? null,
        tags: contactTags,
      },
      touchCount,
      now
    );

    return {
      id: contactId,
      fullName: row.fullName,
      suburb: row.suburb ?? null,
      role: row.role,
      sellerStage: row.sellerStage ?? null,
      lastTouchAt: row.lastTouchAt ? row.lastTouchAt.toISOString() : null,
      nextTouchAt: row.nextTouchAt ? row.nextTouchAt.toISOString() : null,
      owner: row.ownerUserId
        ? { id: String(row.ownerUserId), name: row.ownerName ?? null, email: row.ownerEmail ?? null }
        : null,
      tags: contactTags,
      score,
      band,
      reasons,
      suggestedAction: getSuggestedAction(row.nextTouchAt ?? null, band, now),
    };
  });

  const filtered = isBand(bandFilter)
    ? scored.filter((item) => item.band === bandFilter)
    : scored;

  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aNext = a.nextTouchAt ? new Date(a.nextTouchAt).getTime() : Number.POSITIVE_INFINITY;
    const bNext = b.nextTouchAt ? new Date(b.nextTouchAt).getTime() : Number.POSITIVE_INFINITY;
    return aNext - bNext;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return ok({ data, page, pageSize, total });
});
