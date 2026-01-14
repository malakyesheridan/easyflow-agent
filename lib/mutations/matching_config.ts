import { getDb } from '@/lib/db';
import { matchingConfig, type MatchingConfig, type NewMatchingConfig } from '@/db/schema/matching_config';
import { ok, err, type Result } from '@/lib/result';
import { matchingConfigUpdateSchema, type MatchingConfigUpdateInput } from '@/lib/validators/matching_config';

export async function upsertMatchingConfig(input: MatchingConfigUpdateInput): Promise<Result<MatchingConfig>> {
  try {
    const validated = matchingConfigUpdateSchema.parse(input);
    if (validated.goodMatchThreshold > validated.hotMatchThreshold) {
      return err('VALIDATION_ERROR', 'Good match threshold must be below hot match threshold.');
    }

    const db = getDb();
    const values: NewMatchingConfig = {
      orgId: validated.orgId,
      mode: validated.mode,
      budgetWeight: validated.budgetWeight,
      locationWeight: validated.locationWeight,
      propertyTypeWeight: validated.propertyTypeWeight,
      bedsBathsWeight: validated.bedsBathsWeight,
      timeframeWeight: validated.timeframeWeight,
      hotMatchThreshold: validated.hotMatchThreshold,
      goodMatchThreshold: validated.goodMatchThreshold,
      updatedAt: new Date(),
    } as NewMatchingConfig;

    const [row] = await db
      .insert(matchingConfig)
      .values({ ...values, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: matchingConfig.orgId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    if (!row) return err('INTERNAL_ERROR', 'Failed to update matching config');
    return ok(row);
  } catch (error) {
    console.error('Error updating matching config:', error);
    return err('INTERNAL_ERROR', 'Failed to update matching config', error);
  }
}
