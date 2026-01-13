import { db } from '@/lib/db';
import { tasks } from '@/db/schema/tasks';
import { eq, and } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { Task } from '@/db/schema/tasks';
import {
  taskCreateSchema,
  taskUpdateSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@/lib/validators/tasks';
import { z } from 'zod';

/**
 * Creates a new task.
 * 
 * @param input - The task data (will be validated)
 * @returns Result containing the created task or an error
 */
export async function createTask(
  input: CreateTaskInput
): Promise<Result<Task>> {
  try {
    // Validate input with Zod
    const validated = taskCreateSchema.parse(input);

    // Convert types for database insertion
    const dbValues: any = {
      ...validated,
      // Convert ISO datetime strings to Date objects if they exist
      completedAt: validated.completedAt
        ? new Date(validated.completedAt)
        : null,
    };

    // Insert the task
    const [newTask] = await db
      .insert(tasks)
      .values(dbValues)
      .returning();

    return ok(newTask);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid task input', error.errors);
    }

    // Handle other errors
    console.error('Error creating task:', error);
    return err('INTERNAL_ERROR', 'Failed to create task', error);
  }
}

/**
 * Updates an existing task.
 * 
 * @param input - The update data (will be validated, must include id and orgId)
 * @returns Result containing the updated task or an error
 */
export async function updateTask(
  input: UpdateTaskInput
): Promise<Result<Task>> {
  try {
    // Validate input with Zod
    const validated = taskUpdateSchema.parse(input);

    // Extract id and orgId for the where clause
    const { id, orgId, ...updateData } = validated;

    // Convert types for database update
    const dbValues: any = { ...updateData };

    // Convert ISO datetime strings to Date objects if they exist
    if (updateData.completedAt !== null && updateData.completedAt !== undefined) {
      dbValues.completedAt = new Date(updateData.completedAt);
    }

    // Update updated_at to now
    dbValues.updatedAt = new Date();

    // Update the task
    const [updatedTask] = await db
      .update(tasks)
      .set(dbValues)
      .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
      .returning();

    // Check if task was found and updated
    if (!updatedTask) {
      return err('NOT_FOUND', 'Task not found');
    }

    return ok(updatedTask);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid task update input', error.errors);
    }

    console.error('Error updating task:', error);
    return err('INTERNAL_ERROR', 'Failed to update task', error);
  }
}

/**
 * Marks a task as completed.
 * 
 * @param taskId - The task ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @param completedBy - Optional user/crew ID who completed the task
 * @returns Result containing the updated task or an error
 */
export async function completeTask(
  taskId: string,
  orgId: string,
  completedBy?: string
): Promise<Result<Task>> {
  try {
    // Update task to completed status
    const [updatedTask] = await db
      .update(tasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completedBy: completedBy || null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
      .returning();

    // Check if task was found and updated
    if (!updatedTask) {
      return err('NOT_FOUND', 'Task not found');
    }

    return ok(updatedTask);
  } catch (error) {
    console.error('Error completing task:', error);
    return err('INTERNAL_ERROR', 'Failed to complete task', error);
  }
}

/**
 * Deletes a task.
 * 
 * @param taskId - The task ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result indicating success or failure
 */
export async function deleteTask(
  taskId: string,
  orgId: string
): Promise<Result<void>> {
  try {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
      .returning();

    if (result.length === 0) {
      return err('NOT_FOUND', 'Task not found');
    }

    return ok(undefined);
  } catch (error) {
    console.error('Error deleting task:', error);
    return err('INTERNAL_ERROR', 'Failed to delete task', error);
  }
}

