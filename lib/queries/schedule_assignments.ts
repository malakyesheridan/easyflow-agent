import { eq, and, gte, lte, desc, inArray, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import type { ScheduleAssignment } from '@/db/schema/schedule_assignments';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
import { getCrewIdsForActor, getVisibilityMode, type RequestActor } from '@/lib/authz';

function applyScheduleVisibility(baseWhere: SQL | undefined, actor?: RequestActor): SQL {
  const resolvedBase = baseWhere ?? sql`true`;
  if (!actor || getVisibilityMode(actor) === 'orgWide') return resolvedBase;
  const crewIds = getCrewIdsForActor(actor);
  if (crewIds.length === 0) {
    return sql`false`;
  }
  const combined = and(resolvedBase, inArray(scheduleAssignments.crewId, crewIds));
  return combined ?? resolvedBase;
}

/**
 * Get all schedule assignments for an organization within a date range.
 */
export async function listScheduleAssignments(
  orgId: string,
  startDate: Date,
  endDate: Date,
  actor?: RequestActor
): Promise<Result<ScheduleAssignment[]>> {
  try {
    const db = getDb();
    
    const baseWhere = and(
      eq(scheduleAssignments.orgId, orgId),
      gte(scheduleAssignments.date, startDate),
      lte(scheduleAssignments.date, endDate)
    );
    const where = applyScheduleVisibility(baseWhere, actor);
    const assignments = await db
      .select()
      .from(scheduleAssignments)
      .where(where)
      .orderBy(desc(scheduleAssignments.date), scheduleAssignments.startMinutes);
    
    return ok(assignments);
  } catch (error) {
    console.error('Error listing schedule assignments:', error);
    return err('INTERNAL_ERROR', 'Failed to list schedule assignments', error);
  }
}

/**
 * Get all schedule assignments for a specific date.
 */
export async function listScheduleAssignmentsByDate(
  orgId: string,
  date: Date,
  actor?: RequestActor
): Promise<Result<ScheduleAssignment[]>> {
  try {
    const db = getDb();
    
    // Normalize date to start of day for comparison
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const baseWhere = and(
      eq(scheduleAssignments.orgId, orgId),
      eq(scheduleAssignments.date, normalizedDate)
    );
    const where = applyScheduleVisibility(baseWhere, actor);
    const assignments = await db
      .select()
      .from(scheduleAssignments)
      .where(where)
      .orderBy(scheduleAssignments.startMinutes);
    
    return ok(assignments);
  } catch (error) {
    console.error('Error listing schedule assignments by date:', error);
    return err('INTERNAL_ERROR', 'Failed to list schedule assignments by date', error);
  }
}

/**
 * Get all schedule assignments for a specific job.
 */
export async function listScheduleAssignmentsByJobId(
  jobId: string,
  orgId: string,
  actor?: RequestActor
): Promise<Result<ScheduleAssignment[]>> {
  try {
    const db = getDb();
    
    const baseWhere = and(eq(scheduleAssignments.jobId, jobId), eq(scheduleAssignments.orgId, orgId));
    const where = applyScheduleVisibility(baseWhere, actor);
    const assignments = await db
      .select()
      .from(scheduleAssignments)
      .where(where)
      .orderBy(desc(scheduleAssignments.date), scheduleAssignments.startMinutes);
    
    return ok(assignments);
  } catch (error) {
    console.error('Error listing schedule assignments by job ID:', error);
    return err('INTERNAL_ERROR', 'Failed to list schedule assignments by job ID', error);
  }
}

/**
 * Get a schedule assignment by ID.
 */
export async function getScheduleAssignmentById(
  id: string,
  orgId: string,
  actor?: RequestActor
): Promise<Result<ScheduleAssignment>> {
  try {
    const db = getDb();
    
    const baseWhere = and(eq(scheduleAssignments.id, id), eq(scheduleAssignments.orgId, orgId));
    const where = applyScheduleVisibility(baseWhere, actor);
    const [assignment] = await db
      .select()
      .from(scheduleAssignments)
      .where(where)
      .limit(1);
    
    if (!assignment) {
      return err('NOT_FOUND', 'Schedule assignment not found');
    }
    
    return ok(assignment);
  } catch (error) {
    console.error('Error getting schedule assignment by ID:', error);
    return err('INTERNAL_ERROR', 'Failed to get schedule assignment', error);
  }
}

