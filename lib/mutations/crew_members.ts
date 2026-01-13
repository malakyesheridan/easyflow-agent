import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crewMembers } from '@/db/schema/crew_members';
import { ok, err, type Result } from '@/lib/result';
import {
  createCrewMemberSchema,
  updateCrewMemberSchema,
  type CreateCrewMemberInput,
  type UpdateCrewMemberInput,
} from '@/lib/validators/crew_members';
import type { CrewMember, NewCrewMember } from '@/db/schema/crew_members';
import { listJobIdsForCrewMember } from '@/lib/queries/job_hours_logs';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';

function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export async function createCrewMember(input: CreateCrewMemberInput): Promise<Result<CrewMember>> {
  try {
    const validated = createCrewMemberSchema.parse(input);
    const db = getDb();

    const displayName = validated.displayName?.trim() || buildDisplayName(validated.firstName, validated.lastName);

    const newMember: NewCrewMember = {
      orgId: validated.orgId,
      firstName: validated.firstName.trim(),
      lastName: validated.lastName.trim(),
      displayName,
      role: validated.role,
      email: validated.email?.trim() || null,
      phone: validated.phone?.trim() || null,
      skills: validated.skills?.trim() || null,
      active: validated.active ?? true,
      defaultStartMinutes: validated.defaultStartMinutes ?? 6 * 60,
      defaultEndMinutes: validated.defaultEndMinutes ?? 18 * 60,
      dailyCapacityMinutes: validated.dailyCapacityMinutes ?? 8 * 60,
      costRateCents: validated.costRateCents ?? null,
      costRateType: validated.costRateType ?? 'hourly',
      updatedAt: new Date(),
    };

    const [created] = await db.insert(crewMembers).values(newMember).returning();
    if (!created) return err('INTERNAL_ERROR', 'Failed to create crew member');

    return ok(created);
  } catch (error) {
    console.error('Error creating crew member:', error);
    return err('INTERNAL_ERROR', 'Failed to create crew member', error);
  }
}

export async function updateCrewMember(input: UpdateCrewMemberInput): Promise<Result<CrewMember>> {
  try {
    const validated = updateCrewMemberSchema.parse(input);
    const db = getDb();

    const [existing] = await db
      .select()
      .from(crewMembers)
      .where(and(eq(crewMembers.id, validated.id), eq(crewMembers.orgId, validated.orgId)))
      .limit(1);

    if (!existing) return err('NOT_FOUND', 'Crew member not found');

    const nextFirst = validated.firstName?.trim() ?? existing.firstName;
    const nextLast = validated.lastName?.trim() ?? existing.lastName;
    const nextCostRateCents = validated.costRateCents !== undefined ? validated.costRateCents : existing.costRateCents;
    const nextCostRateType = validated.costRateType !== undefined ? validated.costRateType : existing.costRateType;

    const update: Partial<NewCrewMember> = {
      updatedAt: new Date(),
    };

    if (validated.firstName !== undefined) update.firstName = nextFirst;
    if (validated.lastName !== undefined) update.lastName = nextLast;
    if (validated.role !== undefined) update.role = validated.role;
    if (validated.email !== undefined) update.email = validated.email?.trim() || null;
    if (validated.phone !== undefined) update.phone = validated.phone?.trim() || null;
    if (validated.skills !== undefined) update.skills = validated.skills?.trim() || null;
    if (validated.active !== undefined) update.active = validated.active;
    if (validated.defaultStartMinutes !== undefined) update.defaultStartMinutes = validated.defaultStartMinutes;
    if (validated.defaultEndMinutes !== undefined) update.defaultEndMinutes = validated.defaultEndMinutes;
    if (validated.dailyCapacityMinutes !== undefined) update.dailyCapacityMinutes = validated.dailyCapacityMinutes;
    if (validated.costRateCents !== undefined) update.costRateCents = validated.costRateCents;
    if (validated.costRateType !== undefined) update.costRateType = validated.costRateType;

    if (validated.displayName !== undefined) {
      update.displayName = validated.displayName.trim();
    } else if (validated.firstName !== undefined || validated.lastName !== undefined) {
      update.displayName = buildDisplayName(nextFirst, nextLast);
    }

    const [updated] = await db
      .update(crewMembers)
      .set(update)
      .where(and(eq(crewMembers.id, validated.id), eq(crewMembers.orgId, validated.orgId)))
      .returning();

    if (!updated) return err('INTERNAL_ERROR', 'Failed to update crew member');

    const costRateChanged =
      (validated.costRateCents !== undefined && nextCostRateCents !== existing.costRateCents) ||
      (validated.costRateType !== undefined && nextCostRateType !== existing.costRateType);
    if (costRateChanged) {
      const jobsResult = await listJobIdsForCrewMember({ orgId: validated.orgId, crewMemberId: validated.id });
      if (jobsResult.ok) {
        for (const jobId of jobsResult.data) {
          void evaluateJobGuardrailsBestEffort({ orgId: validated.orgId, jobId });
        }
      }
    }
    return ok(updated);
  } catch (error) {
    console.error('Error updating crew member:', error);
    return err('INTERNAL_ERROR', 'Failed to update crew member', error);
  }
}
