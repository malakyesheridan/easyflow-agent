import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { buyers } from '@/db/schema/buyers';
import { listings } from '@/db/schema/listings';

/**
 * POST /api/demo/seed-real-estate
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const db = getDb();
  const orgKey = context.data.orgId;

  const [existingBuyer] = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(and(eq(buyers.orgId, orgKey), eq(buyers.isDemo, true)))
    .limit(1);

  const [existingListing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.orgId, orgKey), eq(listings.isDemo, true)))
    .limit(1);

  let buyerId = existingBuyer?.id ?? null;
  let listingId = existingListing?.id ?? null;

  if (!buyerId) {
    const [buyer] = await db
      .insert(buyers)
      .values({
        orgId: orgKey,
        firstName: 'Ava',
        lastName: 'Nguyen',
        email: 'demo.buyer@agentos.local',
        phone: '+61 400 000 000',
        budgetMin: 750000,
        budgetMax: 950000,
        preferredSuburbs: ['Fremantle', 'East Fremantle'],
        isDemo: true,
        updatedAt: new Date(),
      })
      .returning();
    buyerId = buyer?.id ?? null;
  }

  if (!listingId) {
    const [listing] = await db
      .insert(listings)
      .values({
        orgId: orgKey,
        addressLine1: '12 Marine Parade',
        suburb: 'Fremantle',
        state: 'WA',
        postcode: '6160',
        status: 'active',
        priceGuide: '$900k - $950k',
        isDemo: true,
        updatedAt: new Date(),
      })
      .returning();
    listingId = listing?.id ?? null;
  }

  return ok({ buyerId, listingId });
});
