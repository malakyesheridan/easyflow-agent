import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { buyerPipelineStages, type BuyerPipelineStage } from '@/db/schema/buyer_pipeline_stages';
import { ok, err, type Result } from '@/lib/result';
import { buyerPipelineStagesUpdateSchema, type BuyerPipelineStagesUpdateInput } from '@/lib/validators/buyer_pipeline_stages';

function normalizeLabel(value: string): string {
  return value.trim();
}

export async function replaceBuyerPipelineStages(
  input: BuyerPipelineStagesUpdateInput
): Promise<Result<BuyerPipelineStage[]>> {
  try {
    const validated = buyerPipelineStagesUpdateSchema.parse(input);
    const stages = validated.stages.map((stage) => ({
      id: stage.id,
      name: normalizeLabel(stage.name),
    }));

    const seen = new Set<string>();
    for (const stage of stages) {
      const key = stage.name.toLowerCase();
      if (seen.has(key)) {
        return err('VALIDATION_ERROR', 'Buyer pipeline stages must be unique.');
      }
      seen.add(key);
    }

    const db = getDb();
    const now = new Date();

    return await db.transaction(async (tx) => {
      const idsToKeep = stages.map((stage) => stage.id).filter(Boolean) as string[];
      if (idsToKeep.length > 0) {
        await tx
          .delete(buyerPipelineStages)
          .where(and(eq(buyerPipelineStages.orgId, validated.orgId), notInArray(buyerPipelineStages.id, idsToKeep)));
      } else {
        await tx.delete(buyerPipelineStages).where(eq(buyerPipelineStages.orgId, validated.orgId));
      }

      for (let index = 0; index < stages.length; index += 1) {
        const stage = stages[index];
        const sortOrder = index + 1;
        if (stage.id) {
          const [updated] = await tx
            .update(buyerPipelineStages)
            .set({ name: stage.name, sortOrder, updatedAt: now })
            .where(and(eq(buyerPipelineStages.id, stage.id), eq(buyerPipelineStages.orgId, validated.orgId)))
            .returning();
          if (updated) continue;
        }

        await tx
          .insert(buyerPipelineStages)
          .values({ orgId: validated.orgId, name: stage.name, sortOrder, updatedAt: now })
          .returning();
      }

      const rows = await tx
        .select()
        .from(buyerPipelineStages)
        .where(eq(buyerPipelineStages.orgId, validated.orgId))
        .orderBy(buyerPipelineStages.sortOrder, buyerPipelineStages.name);

      return ok(rows);
    });
  } catch (error) {
    console.error('Error replacing buyer pipeline stages:', error);
    return err('INTERNAL_ERROR', 'Failed to update buyer pipeline stages', error);
  }
}
