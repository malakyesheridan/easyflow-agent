import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { tags } from '@/db/schema/tags';

const bulkSchema = z.object({
  orgId: z.string().trim().min(1),
  contactIds: z.array(z.string().trim().min(1)).min(1),
  action: z.enum(['add_tags', 'remove_tags', 'set_stage', 'assign_owner', 'set_next_touch']),
  payload: z.record(z.unknown()).optional(),
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

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const db = getDb();
  const contactIds = Array.from(new Set(parsed.data.contactIds));

  if (parsed.data.action === 'add_tags') {
    const tagsInput = Array.isArray(parsed.data.payload?.tags) ? parsed.data.payload?.tags : [];
    const tagNames = tagsInput.map((tag: string) => String(tag).trim()).filter(Boolean);
    if (tagNames.length === 0) return err('VALIDATION_ERROR', 'Tags are required');

    const tagMap = await ensureTagsForOrg({ orgId: context.data.orgId, names: tagNames });
    const tagIds = Array.from(tagMap.values()).map((tag) => tag.id);

    if (tagIds.length > 0) {
      const rows = contactIds.flatMap((contactId) =>
        tagIds.map((tagId) => ({
          contactId,
          tagId,
        }))
      );
      await db.insert(contactTags).values(rows).onConflictDoNothing();
    }

    return ok({ updated: contactIds.length });
  }

  if (parsed.data.action === 'remove_tags') {
    const tagsInput = Array.isArray(parsed.data.payload?.tags) ? parsed.data.payload?.tags : [];
    const tagNames = tagsInput.map((tag: string) => String(tag).trim()).filter(Boolean);
    if (tagNames.length === 0) return err('VALIDATION_ERROR', 'Tags are required');

    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, context.data.orgId), inArray(tags.name, tagNames)));
    const tagIds = tagRows.map((row) => String(row.id));
    if (tagIds.length === 0) return ok({ updated: 0 });

    await db
      .delete(contactTags)
      .where(and(inArray(contactTags.contactId, contactIds), inArray(contactTags.tagId, tagIds)));

    return ok({ updated: contactIds.length });
  }

  if (parsed.data.action === 'set_stage') {
    const sellerStage = typeof parsed.data.payload?.sellerStage === 'string'
      ? parsed.data.payload?.sellerStage.trim()
      : '';
    await db
      .update(contacts)
      .set({ sellerStage: sellerStage || null, updatedAt: new Date() })
      .where(and(eq(contacts.orgId, context.data.orgId), inArray(contacts.id, contactIds)));
    return ok({ updated: contactIds.length });
  }

  if (parsed.data.action === 'assign_owner') {
    const ownerUserId = typeof parsed.data.payload?.ownerUserId === 'string'
      ? parsed.data.payload?.ownerUserId.trim()
      : '';
    await db
      .update(contacts)
      .set({ ownerUserId: ownerUserId || null, updatedAt: new Date() })
      .where(and(eq(contacts.orgId, context.data.orgId), inArray(contacts.id, contactIds)));
    return ok({ updated: contactIds.length });
  }

  if (parsed.data.action === 'set_next_touch') {
    const nextTouchAt = parseDate(parsed.data.payload?.nextTouchAt);
    if (!nextTouchAt) {
      return err('VALIDATION_ERROR', 'Valid next touch date is required');
    }
    await db
      .update(contacts)
      .set({ nextTouchAt, updatedAt: new Date() })
      .where(and(eq(contacts.orgId, context.data.orgId), inArray(contacts.id, contactIds)));
    return ok({ updated: contactIds.length });
  }

  return err('VALIDATION_ERROR', 'Unsupported action');
});
