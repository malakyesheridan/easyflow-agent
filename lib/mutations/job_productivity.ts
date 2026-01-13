import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs, type Job } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { jobProductivityUpdateSchema, type JobProductivityUpdateInput } from '@/lib/validators/job_productivity';
import { toNumericString } from '@/lib/utils/quantity';

export async function updateJobProductivity(
  input: JobProductivityUpdateInput & { approvedByUserId?: string | null }
): Promise<Result<Job>> {
  try {
    const validated = jobProductivityUpdateSchema.parse(input);
    const db = getDb();
    const now = new Date();

    const updateValues: Partial<Job> = {
      updatedAt: now,
    };

    if (validated.plannedM2 !== undefined) {
      updateValues.plannedM2 = validated.plannedM2 === null ? null : toNumericString(validated.plannedM2);
    }
    if (validated.variationM2 !== undefined) {
      updateValues.variationM2 = validated.variationM2 === null ? null : toNumericString(validated.variationM2);
    }
    if (validated.claimedM2 !== undefined) {
      updateValues.claimedM2 = validated.claimedM2 === null ? null : toNumericString(validated.claimedM2);
    }
    if (validated.acceptedM2 !== undefined) {
      updateValues.acceptedM2 = validated.acceptedM2 === null ? null : toNumericString(validated.acceptedM2);
      updateValues.acceptedM2ApprovedBy = validated.acceptedM2 === null ? null : input.approvedByUserId ?? null;
      updateValues.acceptedM2ApprovedAt = validated.acceptedM2 === null ? null : now;
    }
    if (validated.reworkM2 !== undefined) {
      updateValues.reworkM2 = validated.reworkM2 === null ? null : toNumericString(validated.reworkM2);
    }

    if (validated.complexityAccessDifficulty !== undefined) {
      updateValues.complexityAccessDifficulty = validated.complexityAccessDifficulty;
    }
    if (validated.complexityHeightLiftRequirement !== undefined) {
      updateValues.complexityHeightLiftRequirement = validated.complexityHeightLiftRequirement;
    }
    if (validated.complexityPanelHandlingSize !== undefined) {
      updateValues.complexityPanelHandlingSize = validated.complexityPanelHandlingSize;
    }
    if (validated.complexitySiteConstraints !== undefined) {
      updateValues.complexitySiteConstraints = validated.complexitySiteConstraints;
    }
    if (validated.complexityDetailingComplexity !== undefined) {
      updateValues.complexityDetailingComplexity = validated.complexityDetailingComplexity;
    }

    if (validated.qualityDefectCount !== undefined) updateValues.qualityDefectCount = validated.qualityDefectCount ?? 0;
    if (validated.qualityCallbackFlag !== undefined) updateValues.qualityCallbackFlag = validated.qualityCallbackFlag;
    if (validated.qualityMissingDocsFlag !== undefined) updateValues.qualityMissingDocsFlag = validated.qualityMissingDocsFlag;
    if (validated.qualitySafetyFlag !== undefined) updateValues.qualitySafetyFlag = validated.qualitySafetyFlag;

    const [row] = await db
      .update(jobs)
      .set(updateValues)
      .where(and(eq(jobs.orgId, validated.orgId), eq(jobs.id, validated.jobId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Job not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating job productivity:', error);
    return err('INTERNAL_ERROR', 'Failed to update job productivity', error);
  }
}
