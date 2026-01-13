import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import type { ScheduleAssignment, NewScheduleAssignment } from '@/db/schema/schedule_assignments';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
import {
  createScheduleAssignmentSchema,
  updateScheduleAssignmentSchema,
  type CreateScheduleAssignmentInput,
  type UpdateScheduleAssignmentInput,
} from '@/lib/validators/schedule_assignments';

/**
 * Create a new schedule assignment.
 */
export async function createScheduleAssignment(
  input: CreateScheduleAssignmentInput
): Promise<Result<ScheduleAssignment>> {
  try {
    // Validate input
    const validated = createScheduleAssignmentSchema.parse(input);
    
    // Normalize date to start of day
    const date = new Date(validated.date);
    date.setHours(0, 0, 0, 0);
    
    // Validate time bounds
    if (validated.startMinutes >= validated.endMinutes) {
      return err('VALIDATION_ERROR', 'Start time must be before end time');
    }
    
    if (validated.startMinutes < 0 || validated.startMinutes > 720) {
      return err('VALIDATION_ERROR', 'Start time must be between 0 and 720 minutes (06:00 to 18:00)');
    }
    
    if (validated.endMinutes < 0 || validated.endMinutes > 720) {
      return err('VALIDATION_ERROR', 'End time must be between 0 and 720 minutes (06:00 to 18:00)');
    }
    
    const db = getDb();
    
    const crewId: string | null = validated.crewId ?? null;

    const newAssignment: NewScheduleAssignment = {
      orgId: validated.orgId,
      jobId: validated.jobId,
      crewId,
      date,
      startMinutes: validated.startMinutes,
      endMinutes: validated.endMinutes,
      assignmentType: validated.assignmentType,
      status: validated.status || 'scheduled',
      startAtHq: validated.startAtHq ?? false,
      endAtHq: validated.endAtHq ?? false,
    };

    // Safety: prevent accidental exact-duplicate rows (same job + crew + day + time window).
    // Allows multiple assignments per job/day and multiple segments per crew/day as long as the time differs.
    const crewCondition =
      crewId === null
        ? isNull(scheduleAssignments.crewId)
        : eq(scheduleAssignments.crewId, crewId);

    const [existing] = await db
      .select()
      .from(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.orgId, newAssignment.orgId),
          eq(scheduleAssignments.jobId, newAssignment.jobId),
          crewCondition,
          eq(scheduleAssignments.date, newAssignment.date),
          eq(scheduleAssignments.startMinutes, newAssignment.startMinutes),
          eq(scheduleAssignments.endMinutes, newAssignment.endMinutes)
        )
      )
      .limit(1);

    if (existing) {
      return err('VALIDATION_ERROR', 'This job is already assigned to this crew at the same time.');
    }
    
    const [assignment] = await db
      .insert(scheduleAssignments)
      .values(newAssignment)
      .returning();
    
    return ok(assignment);
  } catch (error) {
    console.error('Error creating schedule assignment:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return err('VALIDATION_ERROR', 'Invalid input data', error);
    }
    
    return err('INTERNAL_ERROR', 'Failed to create schedule assignment', error);
  }
}

/**
 * Update an existing schedule assignment.
 */
export async function updateScheduleAssignment(
  input: UpdateScheduleAssignmentInput
): Promise<Result<ScheduleAssignment>> {
  try {
    // Validate input
    const validated = updateScheduleAssignmentSchema.parse(input);
    
    const db = getDb();
    
    // Build update object with only provided fields
    const updateData: Partial<NewScheduleAssignment> = {
      updatedAt: new Date(),
    };
    
    if (validated.crewId !== undefined) {
      updateData.crewId = validated.crewId;
    }
    
    if (validated.date !== undefined) {
      const date = new Date(validated.date);
      date.setHours(0, 0, 0, 0);
      updateData.date = date;
    }
    
    if (validated.startMinutes !== undefined) {
      updateData.startMinutes = validated.startMinutes;
    }
    
    if (validated.endMinutes !== undefined) {
      updateData.endMinutes = validated.endMinutes;
    }
    
    if (validated.assignmentType !== undefined) {
      updateData.assignmentType = validated.assignmentType;
    }

    if (validated.startAtHq !== undefined) {
      updateData.startAtHq = validated.startAtHq;
    }

    if (validated.endAtHq !== undefined) {
      updateData.endAtHq = validated.endAtHq;
    }
    
    if (validated.status !== undefined) {
      updateData.status = validated.status;
    }
    
    // Validate time bounds if both are provided
    if (updateData.startMinutes !== undefined && updateData.endMinutes !== undefined) {
      if (updateData.startMinutes >= updateData.endMinutes) {
        return err('VALIDATION_ERROR', 'Start time must be before end time');
      }
    }
    
    const [updated] = await db
      .update(scheduleAssignments)
      .set(updateData)
      .where(
        and(
          eq(scheduleAssignments.id, validated.id),
          eq(scheduleAssignments.orgId, validated.orgId)
        )
      )
      .returning();
    
    if (!updated) {
      return err('NOT_FOUND', 'Schedule assignment not found');
    }
    
    return ok(updated);
  } catch (error) {
    console.error('Error updating schedule assignment:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return err('VALIDATION_ERROR', 'Invalid input data', error);
    }
    
    return err('INTERNAL_ERROR', 'Failed to update schedule assignment', error);
  }
}

/**
 * Delete a schedule assignment.
 */
export async function deleteScheduleAssignment(
  id: string,
  orgId: string
): Promise<Result<void>> {
  try {
    const db = getDb();
    
    const result = await db
      .delete(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.id, id),
          eq(scheduleAssignments.orgId, orgId)
        )
      );
    
    // Note: result.rowsAffected might not be available in all Drizzle versions
    // If needed, check the result to confirm deletion
    
    return ok(undefined);
  } catch (error) {
    console.error('Error deleting schedule assignment:', error);
    return err('INTERNAL_ERROR', 'Failed to delete schedule assignment', error);
  }
}
