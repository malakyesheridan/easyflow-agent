import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { orgClients, type OrgClient, type NewOrgClient } from '@/db/schema/org_clients';
import { ok, err, type Result } from '@/lib/result';
import { clientCreateSchema, clientUpdateSchema, type CreateClientInput, type UpdateClientInput } from '@/lib/validators/clients';

function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits ? digits : null;
}

function sanitizeTags(tags?: string[] | null): string[] {
  if (!tags) return [];
  return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

function mapUniqueConstraintError(error: any): Result<never> | null {
  const constraint = typeof error?.constraint === 'string' ? error.constraint : '';
  if (constraint === 'org_clients_org_id_normalized_email_unique') {
    return err('CONFLICT', 'Client with this email already exists');
  }
  if (constraint === 'org_clients_org_id_normalized_phone_unique') {
    return err('CONFLICT', 'Client with this phone already exists');
  }
  return null;
}

export async function createClient(input: CreateClientInput): Promise<Result<OrgClient>> {
  try {
    const validated = clientCreateSchema.parse(input);
    const db = getDb();

    const values: NewOrgClient = {
      orgId: validated.orgId,
      displayName: validated.displayName.trim(),
      legalName: validated.legalName?.trim() || null,
      email: validated.email?.trim() || null,
      phone: validated.phone?.trim() || null,
      billingAddress: validated.billingAddress ?? null,
      notes: validated.notes?.trim() || null,
      tags: sanitizeTags(validated.tags),
      normalizedEmail: normalizeEmail(validated.email),
      normalizedPhone: normalizePhone(validated.phone),
      updatedAt: new Date(),
    };

    const [row] = await db.insert(orgClients).values(values).returning();
    if (!row) return err('INTERNAL_ERROR', 'Failed to create client');
    return ok(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid client input', error.errors);
    }
    const conflict = mapUniqueConstraintError(error);
    if (conflict) return conflict;
    console.error('Error creating client:', error);
    return err('INTERNAL_ERROR', 'Failed to create client', error);
  }
}

export async function updateClient(input: UpdateClientInput): Promise<Result<OrgClient>> {
  try {
    const validated = clientUpdateSchema.parse(input);
    const db = getDb();

    const update: Partial<NewOrgClient> = {
      updatedAt: new Date(),
    };

    if (validated.displayName !== undefined) update.displayName = validated.displayName.trim();
    if (validated.legalName !== undefined) update.legalName = validated.legalName?.trim() || null;
    if (validated.email !== undefined) {
      update.email = validated.email?.trim() || null;
      update.normalizedEmail = normalizeEmail(validated.email);
    }
    if (validated.phone !== undefined) {
      update.phone = validated.phone?.trim() || null;
      update.normalizedPhone = normalizePhone(validated.phone);
    }
    if (validated.billingAddress !== undefined) update.billingAddress = validated.billingAddress ?? null;
    if (validated.notes !== undefined) update.notes = validated.notes?.trim() || null;
    if (validated.tags !== undefined) update.tags = sanitizeTags(validated.tags);

    const [row] = await db
      .update(orgClients)
      .set(update)
      .where(and(eq(orgClients.id, validated.id), eq(orgClients.orgId, validated.orgId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Client not found');
    return ok(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid client update input', error.errors);
    }
    const conflict = mapUniqueConstraintError(error);
    if (conflict) return conflict;
    console.error('Error updating client:', error);
    return err('INTERNAL_ERROR', 'Failed to update client', error);
  }
}
