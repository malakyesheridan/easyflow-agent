import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
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

const updateSchema = z.object({
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
  lastTouchAt: z.string().datetime().nullable().optional(),
  nextTouchAt: z.string().datetime().nullable().optional(),
  doNotContact: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
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

  const existingMap = new Map(
    existing.map((row) => [row.name, { id: String(row.id), name: row.name, color: row.color ?? null }])
  );
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

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadContact(params: { orgId: string; contactId: string }) {
  const db = getDb();
  const [row] = await db
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
      doNotContact: contacts.doNotContact,
      marketingOptIn: contacts.marketingOptIn,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.ownerUserId, users.id))
    .where(and(eq(contacts.orgId, params.orgId), eq(contacts.id, params.contactId)))
    .limit(1);

  if (!row) return null;

  const tagRows = await db
    .select({
      contactId: contactTags.contactId,
      tagId: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, params.contactId));

  return {
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
    doNotContact: Boolean(row.doNotContact),
    marketingOptIn: Boolean(row.marketingOptIn),
    tags: tagRows.map((tag) => ({
      id: String(tag.tagId),
      name: tag.name,
      color: tag.color ?? null,
    })),
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) {
    return err('VALIDATION_ERROR', 'Contact id is required');
  }
  const orgId = new URL(req.url).searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const contact = await loadContact({ orgId: orgContext.data.orgId, contactId });
  if (!contact) return err('NOT_FOUND', 'Contact not found');

  return ok(contact);
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const contactId = context?.params?.id;
  if (!contactId) {
    return err('VALIDATION_ERROR', 'Contact id is required');
  }
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const now = new Date();

  const fullName = buildFullName({
    fullName: parsed.data.fullName ?? undefined,
    firstName: parsed.data.firstName ?? undefined,
    lastName: parsed.data.lastName ?? undefined,
  });

  if (parsed.data.fullName || parsed.data.firstName || parsed.data.lastName) {
    if (!fullName) {
      return err('VALIDATION_ERROR', 'Provide full name or first/last name.');
    }
  }

  const payload: Record<string, unknown> = {
    updatedAt: now,
  };

  if (fullName) payload.fullName = fullName;
  if (parsed.data.firstName !== undefined) payload.firstName = parsed.data.firstName ?? null;
  if (parsed.data.lastName !== undefined) payload.lastName = parsed.data.lastName ?? null;
  if (parsed.data.email !== undefined) payload.email = normalizeEmail(parsed.data.email ?? null);
  if (parsed.data.phone !== undefined) payload.phone = normalizePhone(parsed.data.phone ?? null);
  if (parsed.data.address !== undefined) payload.address = parsed.data.address ?? null;
  if (parsed.data.suburb !== undefined) payload.suburb = parsed.data.suburb ?? null;
  if (parsed.data.role !== undefined) payload.role = parsed.data.role;
  if (parsed.data.sellerStage !== undefined) payload.sellerStage = parsed.data.sellerStage ?? null;
  if (parsed.data.temperature !== undefined) payload.temperature = parsed.data.temperature;
  if (parsed.data.leadSource !== undefined) payload.leadSource = parsed.data.leadSource ?? null;
  if (parsed.data.ownerUserId !== undefined) payload.ownerUserId = parsed.data.ownerUserId ?? null;
  if (parsed.data.lastTouchAt !== undefined) payload.lastTouchAt = parseDate(parsed.data.lastTouchAt ?? null);
  if (parsed.data.nextTouchAt !== undefined) payload.nextTouchAt = parseDate(parsed.data.nextTouchAt ?? null);
  if (parsed.data.doNotContact !== undefined) payload.doNotContact = parsed.data.doNotContact;
  if (parsed.data.marketingOptIn !== undefined) payload.marketingOptIn = parsed.data.marketingOptIn;

  await db
    .update(contacts)
    .set(payload)
    .where(and(eq(contacts.orgId, orgContext.data.orgId), eq(contacts.id, contactId)));

  if (parsed.data.tags) {
    const tagNames = parsed.data.tags.map((tag) => tag.trim()).filter(Boolean);
    const tagMap = await ensureTagsForOrg({ orgId: orgContext.data.orgId, names: tagNames });
    await db.delete(contactTags).where(eq(contactTags.contactId, contactId));

    const tagIds = Array.from(tagMap.values()).map((tag) => tag.id);
    if (tagIds.length > 0) {
      await db.insert(contactTags).values(
        tagIds.map((tagId) => ({
          contactId,
          tagId,
        }))
      );
    }
  }

  const updated = await loadContact({ orgId: orgContext.data.orgId, contactId });
  if (!updated) return err('NOT_FOUND', 'Contact not found');

  return ok(updated);
});
