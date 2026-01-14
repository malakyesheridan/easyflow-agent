import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { listingPipelineStages, type ListingPipelineStage } from '@/db/schema/listing_pipeline_stages';
import { ok, err, type Result } from '@/lib/result';
import { listingPipelineStagesUpdateSchema, type ListingPipelineStagesUpdateInput } from '@/lib/validators/listing_pipeline_stages';

function normalizeLabel(value: string): string {
  return value.trim();
}

export async function replaceListingPipelineStages(
  input: ListingPipelineStagesUpdateInput
): Promise<Result<ListingPipelineStage[]>> {
  try {
    const validated = listingPipelineStagesUpdateSchema.parse(input);
    const stages = validated.stages.map((stage) => ({
      id: stage.id,
      name: normalizeLabel(stage.name),
    }));

    const seen = new Set<string>();
    for (const stage of stages) {
      const key = stage.name.toLowerCase();
      if (seen.has(key)) {
        return err('VALIDATION_ERROR', 'Listing pipeline stages must be unique.');
      }
      seen.add(key);
    }

    const db = getDb();
    const now = new Date();

    return await db.transaction(async (tx) => {
      const idsToKeep = stages.map((stage) => stage.id).filter(Boolean) as string[];
      if (idsToKeep.length > 0) {
        await tx
          .delete(listingPipelineStages)
          .where(and(eq(listingPipelineStages.orgId, validated.orgId), notInArray(listingPipelineStages.id, idsToKeep)));
      } else {
        await tx.delete(listingPipelineStages).where(eq(listingPipelineStages.orgId, validated.orgId));
      }

      for (let index = 0; index < stages.length; index += 1) {
        const stage = stages[index];
        const sortOrder = index + 1;
        if (stage.id) {
          const [updated] = await tx
            .update(listingPipelineStages)
            .set({ name: stage.name, sortOrder, updatedAt: now })
            .where(and(eq(listingPipelineStages.id, stage.id), eq(listingPipelineStages.orgId, validated.orgId)))
            .returning();
          if (updated) continue;
        }

        await tx
          .insert(listingPipelineStages)
          .values({ orgId: validated.orgId, name: stage.name, sortOrder, updatedAt: now })
          .returning();
      }

      const rows = await tx
        .select()
        .from(listingPipelineStages)
        .where(eq(listingPipelineStages.orgId, validated.orgId))
        .orderBy(listingPipelineStages.sortOrder, listingPipelineStages.name);

      return ok(rows);
    });
  } catch (error) {
    console.error('Error replacing listing pipeline stages:', error);
    return err('INTERNAL_ERROR', 'Failed to update listing pipeline stages', error);
  }
}
