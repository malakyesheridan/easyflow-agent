import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobInstallModifiers, type JobInstallModifier, type NewJobInstallModifier } from '@/db/schema/job_install_modifiers';
import { ok, err, type Result } from '@/lib/result';
import { jobInstallModifiersUpdateSchema, type JobInstallModifiersUpdateInput } from '@/lib/validators/job_install_modifiers';

export async function setJobInstallModifiers(
  input: JobInstallModifiersUpdateInput
): Promise<Result<JobInstallModifier[]>> {
  try {
    const validated = jobInstallModifiersUpdateSchema.parse(input);
    const db = getDb();

    const enabled = validated.modifiers.filter((m) => m.enabled);
    const values: NewJobInstallModifier[] = enabled.map((m) => ({
      orgId: validated.orgId,
      jobId: validated.jobId,
      modifierId: m.modifierId,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any;

    const result = await db.transaction(async (tx) => {
      await tx
        .delete(jobInstallModifiers)
        .where(and(eq(jobInstallModifiers.orgId, validated.orgId), eq(jobInstallModifiers.jobId, validated.jobId)));

      if (values.length === 0) return [] as JobInstallModifier[];

      return await tx.insert(jobInstallModifiers).values(values).returning();
    });

    return ok(result);
  } catch (error) {
    console.error('Error updating job install modifiers:', error);
    return err('INTERNAL_ERROR', 'Failed to update job modifiers', error);
  }
}
