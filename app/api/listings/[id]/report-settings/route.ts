import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { listings } from '@/db/schema/listings';
import { computeNextDueAt } from '@/lib/reports/cadence';

const patchSchema = z.object({
  orgId: z.string().trim().min(1),
  cadenceEnabled: z.boolean().optional(),
  cadenceType: z.enum(['weekly', 'fortnightly', 'monthly', 'custom', 'none']).optional(),
  cadenceIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
  cadenceDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [row] = await db
    .select({
      cadenceEnabled: listings.reportCadenceEnabled,
      cadenceType: listings.reportCadenceType,
      cadenceIntervalDays: listings.reportCadenceIntervalDays,
      cadenceDayOfWeek: listings.reportCadenceDayOfWeek,
      nextDueAt: listings.reportNextDueAt,
      lastSentAt: listings.reportLastSentAt,
      templateId: listings.reportTemplateId,
    })
    .from(listings)
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)))
    .limit(1);

  if (!row) return err('NOT_FOUND', 'Listing not found');
  return ok({
    cadenceEnabled: row.cadenceEnabled,
    cadenceType: row.cadenceType,
    cadenceIntervalDays: row.cadenceIntervalDays,
    cadenceDayOfWeek: row.cadenceDayOfWeek,
    nextDueAt: toIso(row.nextDueAt),
    lastSentAt: toIso(row.lastSentAt),
    templateId: row.templateId ? String(row.templateId) : null,
  });
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [listing] = await db
    .select({
      listedAt: listings.listedAt,
      reportLastSentAt: listings.reportLastSentAt,
      reportCadenceEnabled: listings.reportCadenceEnabled,
      reportCadenceType: listings.reportCadenceType,
      reportCadenceIntervalDays: listings.reportCadenceIntervalDays,
      reportCadenceDayOfWeek: listings.reportCadenceDayOfWeek,
      reportTemplateId: listings.reportTemplateId,
    })
    .from(listings)
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)))
    .limit(1);

  if (!listing) return err('NOT_FOUND', 'Listing not found');

  const cadenceEnabled = parsed.data.cadenceEnabled ?? listing.reportCadenceEnabled;
  const cadenceType = parsed.data.cadenceType ?? listing.reportCadenceType;
  const cadenceIntervalDays = parsed.data.cadenceIntervalDays ?? listing.reportCadenceIntervalDays;
  const cadenceDayOfWeek = parsed.data.cadenceDayOfWeek ?? listing.reportCadenceDayOfWeek;
  const templateId = parsed.data.templateId !== undefined ? parsed.data.templateId : (listing.reportTemplateId ? String(listing.reportTemplateId) : null);

  let nextDueAt: Date | null = listing.reportLastSentAt ?? listing.listedAt ?? new Date();
  if (parsed.data.nextDueAt !== undefined) {
    nextDueAt = parsed.data.nextDueAt ? new Date(parsed.data.nextDueAt) : null;
  } else if (cadenceEnabled && cadenceType !== 'none') {
    nextDueAt = computeNextDueAt({
      baseDate: listing.reportLastSentAt ?? listing.listedAt ?? new Date(),
      cadence: { cadenceType, intervalDays: cadenceIntervalDays, dayOfWeek: cadenceDayOfWeek },
    });
  } else {
    nextDueAt = null;
  }

  await db
    .update(listings)
    .set({
      reportCadenceEnabled: cadenceEnabled,
      reportCadenceType: cadenceType,
      reportCadenceIntervalDays: cadenceIntervalDays,
      reportCadenceDayOfWeek: cadenceDayOfWeek,
      reportNextDueAt: nextDueAt,
      reportTemplateId: templateId,
      updatedAt: new Date(),
    })
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)));

  return ok({
    cadenceEnabled,
    cadenceType,
    cadenceIntervalDays,
    cadenceDayOfWeek,
    nextDueAt: toIso(nextDueAt),
    templateId,
  });
});
