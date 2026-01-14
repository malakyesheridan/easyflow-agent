import { and, eq, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { buyers } from '@/db/schema/buyers';
import { listings } from '@/db/schema/listings';
import { leadSources } from '@/db/schema/lead_sources';
import { buyerPipelineStages } from '@/db/schema/buyer_pipeline_stages';
import { listingPipelineStages } from '@/db/schema/listing_pipeline_stages';
import { matchingConfig } from '@/db/schema/matching_config';
import { reportTemplates } from '@/db/schema/report_templates';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const db = getDb();
  const orgKey = context.data.orgId;

  const [buyerRow] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      demo: sql<number>`sum(case when ${buyers.isDemo} then 1 else 0 end)`.mapWith(Number),
    })
    .from(buyers)
    .where(eq(buyers.orgId, orgKey));

  const [listingRow] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      demo: sql<number>`sum(case when ${listings.isDemo} then 1 else 0 end)`.mapWith(Number),
    })
    .from(listings)
    .where(eq(listings.orgId, orgKey));

  const [leadSourceRow] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(leadSources)
    .where(eq(leadSources.orgId, orgKey));

  const [buyerStageRow] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(buyerPipelineStages)
    .where(eq(buyerPipelineStages.orgId, orgKey));

  const [listingStageRow] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(listingPipelineStages)
    .where(eq(listingPipelineStages.orgId, orgKey));

  const [matchingRow] = await db
    .select({ mode: matchingConfig.mode })
    .from(matchingConfig)
    .where(eq(matchingConfig.orgId, orgKey))
    .limit(1);

  const [reportRow] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(reportTemplates)
    .where(and(eq(reportTemplates.orgId, orgKey), eq(reportTemplates.templateType, 'vendor')));

  return ok({
    buyers: {
      total: Number(buyerRow?.total ?? 0),
      demo: Number(buyerRow?.demo ?? 0),
    },
    listings: {
      total: Number(listingRow?.total ?? 0),
      demo: Number(listingRow?.demo ?? 0),
    },
    leadSources: Number(leadSourceRow?.total ?? 0),
    buyerPipelineStages: Number(buyerStageRow?.total ?? 0),
    listingPipelineStages: Number(listingStageRow?.total ?? 0),
    matchingConfig: {
      exists: Boolean(matchingRow),
      mode: matchingRow?.mode ?? null,
    },
    reportTemplates: {
      vendorCount: Number(reportRow?.total ?? 0),
    },
    matches: {
      hot: 0,
      good: 0,
    },
    nextActions: {
      dueToday: 0,
      overdue: 0,
    },
  });
});
