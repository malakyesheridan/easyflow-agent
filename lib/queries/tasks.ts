import { db } from '@/lib/db';
import { tasks } from '@/db/schema/tasks';
import { jobs } from '@/db/schema/jobs';
import { eq, and, asc, desc } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { Task } from '@/db/schema/tasks';
import type { TaskStatus } from '@/lib/validators/tasks';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

/**
 * Lists tasks for a specific job, ordered by execution order.
 * 
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result containing array of tasks or an error
 */
export async function listTasksForJob(
  jobId: string,
  orgId: string,
  actor?: RequestActor
): Promise<Result<Task[]>> {
  try {
    const baseWhere = and(eq(tasks.jobId, jobId), eq(tasks.orgId, orgId));
    const jobVisibility = actor ? applyJobVisibility(eq(jobs.orgId, orgId), actor, jobs) : null;
    const where = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

    const tasksList = await db
      .select({
        id: tasks.id,
        orgId: tasks.orgId,
        jobId: tasks.jobId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        isRequired: tasks.isRequired,
        order: tasks.order,
        completedAt: tasks.completedAt,
        completedBy: tasks.completedBy,
        isDemo: tasks.isDemo,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(jobs, eq(jobs.id, tasks.jobId))
      .where(where)
      .orderBy(asc(tasks.order));

    return ok(tasksList);
  } catch (error) {
    console.error('Error listing tasks for job:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch tasks', error);
  }
}

/**
 * Lists tasks by status for an organization.
 * 
 * @param orgId - The organization ID (UUID)
 * @param status - The task status to filter by
 * @returns Result containing array of tasks or an error
 */
export async function listTasksByStatus(
  orgId: string,
  status: TaskStatus,
  actor?: RequestActor
): Promise<Result<Task[]>> {
  try {
    const baseWhere = and(eq(tasks.orgId, orgId), eq(tasks.status, status));
    const jobVisibility = actor ? applyJobVisibility(eq(jobs.orgId, orgId), actor, jobs) : null;
    const where = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

    const tasksList = await db
      .select({
        id: tasks.id,
        orgId: tasks.orgId,
        jobId: tasks.jobId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        isRequired: tasks.isRequired,
        order: tasks.order,
        completedAt: tasks.completedAt,
        completedBy: tasks.completedBy,
        isDemo: tasks.isDemo,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(jobs, eq(jobs.id, tasks.jobId))
      .where(where)
      .orderBy(desc(tasks.updatedAt));

    return ok(tasksList);
  } catch (error) {
    console.error('Error listing tasks by status:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch tasks', error);
  }
}

/**
 * Retrieves a single task by ID and organization ID.
 * 
 * @param taskId - The task ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result containing the task or an error
 */
export async function getTaskById(
  taskId: string,
  orgId: string,
  actor?: RequestActor
): Promise<Result<Task>> {
  try {
    const baseWhere = and(eq(tasks.id, taskId), eq(tasks.orgId, orgId));
    const jobVisibility = actor ? applyJobVisibility(eq(jobs.orgId, orgId), actor, jobs) : null;
    const where = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

    const [task] = await db
      .select({
        id: tasks.id,
        orgId: tasks.orgId,
        jobId: tasks.jobId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        isRequired: tasks.isRequired,
        order: tasks.order,
        completedAt: tasks.completedAt,
        completedBy: tasks.completedBy,
        isDemo: tasks.isDemo,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(jobs, eq(jobs.id, tasks.jobId))
      .where(where)
      .limit(1);

    if (!task) {
      return err('NOT_FOUND', 'Task not found');
    }

    return ok(task);
  } catch (error) {
    console.error('Error fetching task by ID:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch tasks', error);
  }
}

