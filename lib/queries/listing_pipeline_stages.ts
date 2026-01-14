import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { listingPipelineStages, type ListingPipelineStage } from '@/db/schema/listing_pipeline_stages';
import { ok, err, type Result } from '@/lib/result';

export async function listListingPipelineStages(params: { orgId: string }): Promise<Result<ListingPipelineStage[]>> {
  try {
    const db = getDb();
    const data = await db
      .select()
      .from(listingPipelineStages)
      .where(eq(listingPipelineStages.orgId, params.orgId))
      .orderBy(asc(listingPipelineStages.sortOrder), asc(listingPipelineStages.name));
    return ok(data);
  } catch (error) {
    console.error('Error listing listing pipeline stages:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch listing pipeline stages', error);
  }
}
