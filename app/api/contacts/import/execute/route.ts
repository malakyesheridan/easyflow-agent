import { z } from 'zod';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { tags } from '@/db/schema/tags';
import { parseCsv, stringifyCsv } from '@/lib/utils/csv';
import { buildFullName, normalizeEmail, normalizePhone } from '@/lib/contacts/normalize';

const roleValues = ['seller', 'buyer', 'both', 'unknown'] as const;
const temperatureValues = ['hot', 'warm', 'cold', 'unknown'] as const;

const executeSchema = z.object({
  orgId: z.string().trim().min(1),
  csvText: z.string().min(1),
  mapping: z.record(z.string()).optional(),
  dedupeMode: z.enum(['create_only', 'upsert']).default('create_only'),
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

function normalizeRole(value: string | null): typeof roleValues[number] {
  if (!value) return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'seller' || normalized === 'vendor') return 'seller';
  if (normalized === 'buyer') return 'buyer';
  if (normalized === 'both') return 'both';
  return 'unknown';
}

function normalizeTemperature(value: string | null): typeof temperatureValues[number] {
  if (!value) return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'hot') return 'hot';
  if (normalized === 'warm') return 'warm';
  if (normalized === 'cold') return 'cold';
  return 'unknown';
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const db = getDb();
  const { headers, rows } = parseCsv(parsed.data.csvText);
  if (headers.length === 0) {
    return err('VALIDATION_ERROR', 'CSV must include headers');
  }

  const mapping = parsed.data.mapping ?? {};
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  const failedRows: Array<{ row: string[]; error: string }> = [];
  const candidates: Array<{
    rowIndex: number;
    row: string[];
    contact: {
      fullName: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      suburb: string | null;
      role: typeof roleValues[number];
      sellerStage: string | null;
      temperature: typeof temperatureValues[number];
      leadSource: string | null;
      lastTouchAt: Date | null;
      nextTouchAt: Date | null;
      tags: string[];
    };
  }> = [];

  const getValue = (row: string[], field: string) => {
    const header = mapping[field];
    if (!header) return '';
    const index = headerIndex.get(header);
    if (index === undefined) return '';
    return row[index] ?? '';
  };

  rows.forEach((row, rowIndex) => {
    const errors: string[] = [];

    const fullNameRaw = getValue(row, 'full_name');
    const firstNameRaw = getValue(row, 'first_name');
    const lastNameRaw = getValue(row, 'last_name');

    const fullName = buildFullName({
      fullName: fullNameRaw,
      firstName: firstNameRaw,
      lastName: lastNameRaw,
    });

    if (!fullName) {
      errors.push('Missing name');
    }

    const email = normalizeEmail(getValue(row, 'email'));
    if (getValue(row, 'email') && !email) {
      errors.push('Invalid email');
    }

    const phone = normalizePhone(getValue(row, 'phone'));

    const lastTouchAtRaw = getValue(row, 'last_touch_at');
    const nextTouchAtRaw = getValue(row, 'next_touch_at');
    const lastTouchAt = lastTouchAtRaw ? parseDate(lastTouchAtRaw) : null;
    const nextTouchAt = nextTouchAtRaw ? parseDate(nextTouchAtRaw) : null;

    if (lastTouchAtRaw && !lastTouchAt) {
      errors.push('Invalid last_touch_at');
    }
    if (nextTouchAtRaw && !nextTouchAt) {
      errors.push('Invalid next_touch_at');
    }

    if (errors.length > 0) {
      failedRows.push({ row, error: errors.join('; ') });
      return;
    }

    const role = normalizeRole(getValue(row, 'role'));
    const temperature = normalizeTemperature(getValue(row, 'temperature'));

    const tags = parseTags(getValue(row, 'tags'));

    candidates.push({
      rowIndex,
      row,
      contact: {
        fullName: fullName ?? '',
        firstName: firstNameRaw?.trim() || null,
        lastName: lastNameRaw?.trim() || null,
        email,
        phone,
        address: getValue(row, 'address')?.trim() || null,
        suburb: getValue(row, 'suburb')?.trim() || null,
        role,
        sellerStage: getValue(row, 'seller_stage')?.trim() || null,
        temperature,
        leadSource: getValue(row, 'lead_source')?.trim() || null,
        lastTouchAt,
        nextTouchAt,
        tags,
      },
    });
  });

  const allTags = candidates.flatMap((candidate) => candidate.contact.tags);
  const tagMap = await ensureTagsForOrg({ orgId: context.data.orgId, names: allTags });

  const emails = Array.from(new Set(candidates.map((row) => row.contact.email).filter(Boolean))) as string[];
  const phones = Array.from(new Set(candidates.map((row) => row.contact.phone).filter(Boolean))) as string[];

  const existingFilters = [eq(contacts.orgId, context.data.orgId)];
  if (emails.length > 0 && phones.length > 0) {
    const combined = or(
      inArray(sql`lower(${contacts.email})`, emails),
      inArray(contacts.phone, phones)
    );
    if (combined) existingFilters.push(combined);
  } else if (emails.length > 0) {
    existingFilters.push(inArray(sql`lower(${contacts.email})`, emails));
  } else if (phones.length > 0) {
    existingFilters.push(inArray(contacts.phone, phones));
  }

  const existingRows = emails.length > 0 || phones.length > 0
    ? await db
        .select({ id: contacts.id, email: contacts.email, phone: contacts.phone })
        .from(contacts)
        .where(and(...existingFilters))
    : [];

  const existingByEmail = new Map<string, string>();
  const existingByPhone = new Map<string, string>();
  existingRows.forEach((row) => {
    if (row.email) existingByEmail.set(String(row.email).toLowerCase(), String(row.id));
    if (row.phone) existingByPhone.set(String(row.phone), String(row.id));
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const contact = candidate.contact;
    const existingId = contact.email
      ? existingByEmail.get(contact.email)
      : contact.phone
        ? existingByPhone.get(contact.phone)
        : undefined;

    if (existingId && parsed.data.dedupeMode === 'create_only') {
      skipped += 1;
      continue;
    }

    if (existingId && parsed.data.dedupeMode === 'upsert') {
      const updatePayload: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (contact.fullName) updatePayload.fullName = contact.fullName;
      if (contact.firstName) updatePayload.firstName = contact.firstName;
      if (contact.lastName) updatePayload.lastName = contact.lastName;
      if (contact.email) updatePayload.email = contact.email;
      if (contact.phone) updatePayload.phone = contact.phone;
      if (contact.address) updatePayload.address = contact.address;
      if (contact.suburb) updatePayload.suburb = contact.suburb;
      if (contact.role) updatePayload.role = contact.role;
      if (contact.sellerStage) updatePayload.sellerStage = contact.sellerStage;
      if (contact.temperature) updatePayload.temperature = contact.temperature;
      if (contact.leadSource) updatePayload.leadSource = contact.leadSource;
      if (contact.lastTouchAt) updatePayload.lastTouchAt = contact.lastTouchAt;
      if (contact.nextTouchAt) updatePayload.nextTouchAt = contact.nextTouchAt;

      await db
        .update(contacts)
        .set(updatePayload)
        .where(and(eq(contacts.orgId, context.data.orgId), eq(contacts.id, existingId)));

      if (contact.tags.length > 0) {
        const tagIds = contact.tags
          .map((tag) => tagMap.get(tag)?.id)
          .filter(Boolean) as string[];
        if (tagIds.length > 0) {
          const rows = tagIds.map((tagId) => ({ contactId: existingId, tagId }));
          await db.insert(contactTags).values(rows).onConflictDoNothing();
        }
      }

      updated += 1;
      continue;
    }

    const [inserted] = await db
      .insert(contacts)
      .values({
        orgId: context.data.orgId,
        fullName: contact.fullName,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
        suburb: contact.suburb,
        role: contact.role,
        sellerStage: contact.sellerStage,
        temperature: contact.temperature,
        leadSource: contact.leadSource,
        lastTouchAt: contact.lastTouchAt,
        nextTouchAt: contact.nextTouchAt,
        updatedAt: new Date(),
      })
      .returning({ id: contacts.id });

    const contactId = inserted?.id ? String(inserted.id) : null;
    if (!contactId) {
      failedRows.push({ row: candidate.row, error: 'Failed to create contact' });
      continue;
    }

    if (contact.tags.length > 0) {
      const tagIds = contact.tags
        .map((tag) => tagMap.get(tag)?.id)
        .filter(Boolean) as string[];
      if (tagIds.length > 0) {
        await db.insert(contactTags).values(
          tagIds.map((tagId) => ({
            contactId,
            tagId,
          }))
        );
      }
    }

    created += 1;
  }

  const failedCsvRows = failedRows.map((item) => [...item.row, item.error]);
  const failedRowsCsv = failedCsvRows.length > 0
    ? stringifyCsv([[...headers, 'error'], ...failedCsvRows])
    : '';

  return ok({
    summary: {
      created,
      updated,
      skipped,
      failed: failedRows.length,
    },
    failedRowsCsv,
  });
});
