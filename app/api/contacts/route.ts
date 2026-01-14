import { z } from 'zod';
import { and, asc, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { tags } from '@/db/schema/tags';
import { users } from '@/db/schema/users';
import { buildFullName, normalizeEmail, normalizePhone } from '@/lib/contacts/normalize';

const roleValues = ['seller', 'buyer', 'both', 'unknown'] as const;
const temperatureValues = ['hot', 'warm', 'cold', 'unknown'] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  fullName: z.string().trim().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  suburb: z.string().trim().optional(),
  role: z.enum(roleValues).optional(),
  sellerStage: z.string().trim().optional(),
  temperature: z.enum(temperatureValues).optional(),
  leadSource: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  ownerUserId: z.string().trim().nullable().optional(),
  lastTouchAt: z.string().datetime().optional(),
  nextTouchAt: z.string().datetime().optional(),
});

type TagRow = { id: string; name: string; color: string | null };

async function ensureTagsForOrg(params: { orgId: string; names: string[] }) {
  const db = getDb();
  const unique = Array.from(new Set(params.names.map((name) => name.trim()).filter(Boolean)));
  if (unique.length === 0) return new Map<string, TagRow>();

  const existing = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.orgId, params.orgId), inArray(tags.name, unique)));

  const existingMap = new Map(existing.map((row) => [row.name, { id: String(row.id), name: row.name, color: row.color ?? null }]));
  const missing = unique.filter((name) => !existingMap.has(name));

  if (missing.length > 0) {
    const inserted = await db
      .insert(tags)
      .values(missing.map((name) => ({ orgId: params.orgId, name })))
      .returning({ id: tags.id, name: tags.name, color: tags.color });
    inserted.forEach((row) => {
      existingMap.set(row.name, { id: String(row.id), name: row.name, color: row.color ?? null });
    });
  }

  return existingMap;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildSearchFilter(search: string) {
  const like = `%${search}%`;
  return or(
    ilike(contacts.fullName, like),
    ilike(contacts.firstName, like),
    ilike(contacts.lastName, like),
    ilike(contacts.email, like),
    ilike(contacts.phone, like),
    ilike(contacts.address, like),
    ilike(contacts.suburb, like)
  );
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
  const leadSource = searchParams.get('leadSource')?.trim() ?? '';
  const tagFilters = searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean);
  const dueToday = searchParams.get('dueToday') === 'true';
  const overdue = searchParams.get('overdue') === 'true';
  const sort = searchParams.get('sort') ?? 'next_touch_at_asc';
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

  if (role && roleValues.includes(role as typeof roleValues[number])) {
    conditions.push(eq(contacts.role, role as typeof roleValues[number]));
  }

  if (sellerStage) {
    conditions.push(eq(contacts.sellerStage, sellerStage));
  }

  if (leadSource) {
    conditions.push(eq(contacts.leadSource, leadSource));
  }

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
    const now = new Date();
    const overdueCondition = and(
      sql`${contacts.nextTouchAt} < ${now}`,
      sql`${contacts.nextTouchAt} is not null`
    );
    if (overdueCondition) conditions.push(overdueCondition);
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

  const orderBy = (() => {
    if (sort === 'last_touch_at_desc') {
      return [sql`${contacts.lastTouchAt} is null`, desc(contacts.lastTouchAt)];
    }
    if (sort === 'created_at_desc') {
      return [desc(contacts.createdAt)];
    }
    return [sql`${contacts.nextTouchAt} is null`, asc(contacts.nextTouchAt)];
  })();

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(contacts)
    .where(and(...conditions));

  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      address: contacts.address,
      suburb: contacts.suburb,
      role: contacts.role,
      sellerStage: contacts.sellerStage,
      temperature: contacts.temperature,
      leadSource: contacts.leadSource,
      lastTouchAt: contacts.lastTouchAt,
      nextTouchAt: contacts.nextTouchAt,
      ownerUserId: contacts.ownerUserId,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.ownerUserId, users.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const contactIds = rows.map((row) => String(row.id));
  const tagRows = contactIds.length
    ? await db
        .select({
          contactId: contactTags.contactId,
          tagId: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : [];

  const tagsByContact = new Map<string, TagRow[]>();
  tagRows.forEach((row) => {
    const contactId = String(row.contactId);
    const existing = tagsByContact.get(contactId) ?? [];
    existing.push({ id: String(row.tagId), name: row.name, color: row.color ?? null });
    tagsByContact.set(contactId, existing);
  });

  const data = rows.map((row) => ({
    id: String(row.id),
    fullName: row.fullName,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    suburb: row.suburb ?? null,
    role: row.role,
    sellerStage: row.sellerStage ?? null,
    temperature: row.temperature,
    leadSource: row.leadSource ?? null,
    lastTouchAt: row.lastTouchAt ? row.lastTouchAt.toISOString() : null,
    nextTouchAt: row.nextTouchAt ? row.nextTouchAt.toISOString() : null,
    owner: row.ownerUserId
      ? {
          id: String(row.ownerUserId),
          name: row.ownerName ?? null,
          email: row.ownerEmail ?? null,
        }
      : null,
    tags: tagsByContact.get(String(row.id)) ?? [],
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  }));

  return ok({ data, page, pageSize, total: Number(total ?? 0) });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const fullName = buildFullName({
    fullName: parsed.data.fullName ?? null,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
  });

  if (!fullName) {
    return err('VALIDATION_ERROR', 'Provide full name or first/last name.');
  }

  const email = normalizeEmail(parsed.data.email ?? null);
  const phone = normalizePhone(parsed.data.phone ?? null);
  const lastTouchAt = parseDate(parsed.data.lastTouchAt ?? null);
  const nextTouchAt = parseDate(parsed.data.nextTouchAt ?? null);

  const now = new Date();
  const db = getDb();

  const tagNames = (parsed.data.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const tagMap = await ensureTagsForOrg({ orgId: context.data.orgId, names: tagNames });

  const [inserted] = await db
    .insert(contacts)
    .values({
      orgId: context.data.orgId,
      ownerUserId: parsed.data.ownerUserId ?? null,
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
      fullName,
      email,
      phone,
      address: parsed.data.address ?? null,
      suburb: parsed.data.suburb ?? null,
      role: parsed.data.role ?? 'unknown',
      sellerStage: parsed.data.sellerStage ?? null,
      temperature: parsed.data.temperature ?? 'unknown',
      leadSource: parsed.data.leadSource ?? null,
      lastTouchAt: lastTouchAt ?? null,
      nextTouchAt: nextTouchAt ?? null,
      updatedAt: now,
    })
    .returning({ id: contacts.id });

  const contactId = inserted?.id ? String(inserted.id) : null;
  if (!contactId) {
    return err('INTERNAL_ERROR', 'Failed to create contact');
  }

  const tagIds = Array.from(tagMap.values()).map((tag) => tag.id);
  if (tagIds.length > 0) {
    await db.insert(contactTags).values(
      tagIds.map((tagId) => ({
        contactId,
        tagId,
      }))
    );
  }

  return ok({ id: contactId });
});
