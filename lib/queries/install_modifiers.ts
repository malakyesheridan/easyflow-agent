import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { installModifiers } from '@/db/schema/install_modifiers';
import { jobInstallModifiers } from '@/db/schema/job_install_modifiers';
import { ok, err, type Result } from '@/lib/result';
import type { InstallModifier } from '@/db/schema/install_modifiers';

export type InstallModifierWithJobState = InstallModifier & {
  jobEnabled: boolean;
};

export async function listInstallModifiers(params: { orgId: string }): Promise<Result<InstallModifier[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(installModifiers)
      .where(eq(installModifiers.orgId, params.orgId))
      .orderBy(asc(installModifiers.name));
    return ok(rows);
  } catch (error) {
    console.error('Error listing install modifiers:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch install modifiers', error);
  }
}

export async function listInstallModifiersForJob(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<InstallModifierWithJobState[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: installModifiers.id,
        orgId: installModifiers.orgId,
        name: installModifiers.name,
        description: installModifiers.description,
        multiplier: installModifiers.multiplier,
        enabled: installModifiers.enabled,
        createdAt: installModifiers.createdAt,
        updatedAt: installModifiers.updatedAt,
        jobEnabled: jobInstallModifiers.enabled,
      })
      .from(installModifiers)
      .leftJoin(
        jobInstallModifiers,
        and(
          eq(jobInstallModifiers.orgId, installModifiers.orgId),
          eq(jobInstallModifiers.modifierId, installModifiers.id),
          eq(jobInstallModifiers.jobId, params.jobId)
        )
      )
      .where(eq(installModifiers.orgId, params.orgId))
      .orderBy(asc(installModifiers.name));

    const data = rows.map((row) => ({
      ...row,
      jobEnabled: Boolean(row.jobEnabled),
    })) as InstallModifierWithJobState[];

    return ok(data);
  } catch (error) {
    console.error('Error listing install modifiers for job:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch install modifiers', error);
  }
}
