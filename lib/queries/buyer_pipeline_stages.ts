import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { buyerPipelineStages, type BuyerPipelineStage } from '@/db/schema/buyer_pipeline_stages';
import { ok, err, type Result } from '@/lib/result';

export async function listBuyerPipelineStages(params: { orgId: string }): Promise<Result<BuyerPipelineStage[]>> {
  try {
    const db = getDb();
    const data = await db
      .select()
      .from(buyerPipelineStages)
      .where(eq(buyerPipelineStages.orgId, params.orgId))
      .orderBy(asc(buyerPipelineStages.sortOrder), asc(buyerPipelineStages.name));
    return ok(data);
  } catch (error) {
    console.error('Error listing buyer pipeline stages:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch buyer pipeline stages', error);
  }
}
