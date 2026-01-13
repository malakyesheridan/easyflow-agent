import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgs, type Org, type NewOrg } from '@/db/schema/orgs';
import { ok, err, type Result } from '@/lib/result';
import { orgUpdateSchema, type OrgUpdateInput } from '@/lib/validators/orgs';

export async function updateOrg(input: OrgUpdateInput): Promise<Result<Org>> {
  try {
    const validated = orgUpdateSchema.parse(input);
    const db = getDb();

    const update: Partial<NewOrg> = { updatedAt: new Date() };
    if (validated.name !== undefined) update.name = validated.name.trim();
    if (validated.logoPath !== undefined) update.logoPath = validated.logoPath;
    if (validated.brandPrimaryColor !== undefined) update.brandPrimaryColor = validated.brandPrimaryColor;
    if (validated.brandSecondaryColor !== undefined) update.brandSecondaryColor = validated.brandSecondaryColor;
    if (validated.onboardingCompleted !== undefined) update.onboardingCompleted = validated.onboardingCompleted;
    if (validated.onboardingStep !== undefined) update.onboardingStep = validated.onboardingStep;

    const [row] = await db
      .update(orgs)
      .set(update)
      .where(eq(orgs.id, validated.id))
      .returning();

    if (!row) return err('NOT_FOUND', 'Organisation not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating org:', error);
    return err('INTERNAL_ERROR', 'Failed to update organisation', error);
  }
}
