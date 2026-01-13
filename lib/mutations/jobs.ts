import { db } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { tasks } from '@/db/schema/tasks';
import { orgClients } from '@/db/schema/org_clients';
import { eq, and, sql, like, or } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import {
  jobCreateSchema,
  jobUpdateSchema,
  jobStatusSchema,
  type CreateJobInput,
  type UpdateJobInput,
  type JobStatus,
} from '@/lib/validators/jobs';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { listTasksForJob } from '@/lib/queries/tasks';
import { taskCreateSchema, type CreateTaskInput } from '@/lib/validators/tasks';
import { z } from 'zod';
import { isClientInOrg } from '@/lib/clients/validation';

const DEBUG_JOBS_MUTATIONS = process.env.NODE_ENV !== 'production';

async function ensureClientInOrg(orgId: string, clientId: string): Promise<Result<true>> {
  const [row] = await db
    .select({ id: orgClients.id, orgId: orgClients.orgId })
    .from(orgClients)
    .where(eq(orgClients.id, clientId))
    .limit(1);
  if (!row || !isClientInOrg(row.orgId, orgId)) {
    return err('VALIDATION_ERROR', 'Client not found for this organization');
  }
  return ok(true);
}

/**
 * Creates a new job.
 * 
 * @param input - The job data (will be validated)
 * @returns Result containing the created job or an error
 */
export async function createJob(
  input: CreateJobInput
): Promise<Result<Job>> {
  try {
    // Validate input with Zod
    const validated = jobCreateSchema.parse(input);

    if (validated.clientId) {
      const clientCheck = await ensureClientInOrg(validated.orgId, validated.clientId);
      if (!clientCheck.ok) return clientCheck;
    }

    // Convert types for database insertion
    const dbValues: any = {
      ...validated,
      // Convert numeric fields to strings (Drizzle numeric columns expect strings)
      latitude:
        validated.latitude !== null && validated.latitude !== undefined
          ? String(validated.latitude)
          : null,
      longitude:
        validated.longitude !== null && validated.longitude !== undefined
          ? String(validated.longitude)
          : null,
      // Convert ISO datetime strings to Date objects
      scheduledStart: validated.scheduledStart
        ? new Date(validated.scheduledStart)
        : null,
      scheduledEnd: validated.scheduledEnd
        ? new Date(validated.scheduledEnd)
        : null,
    };

    // Insert the job
    const [newJob] = await db
      .insert(jobs)
      .values(dbValues)
      .returning();

    return ok(newJob);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid job input', error.errors);
    }

    // Handle other errors
    console.error('Error creating job:', error);
    return err('INTERNAL_ERROR', 'Failed to create job', error);
  }
}

/**
 * Generates a duplicate title by appending (Copy) or incrementing the number.
 * 
 * @param baseTitle - The original job title
 * @param orgId - Organization ID to check for existing titles
 * @returns The new title with (Copy) or (Copy N) suffix
 */
async function generateDuplicateTitle(
  baseTitle: string,
  orgId: string
): Promise<string> {
  // Check if title already ends with (Copy) or (Copy N)
  const copyMatch = baseTitle.match(/^(.+?)\s*\(Copy(?:\s+(\d+))?\)$/);
  const baseName = copyMatch ? copyMatch[1].trim() : baseTitle.trim();

  // Try to find existing jobs with similar titles using pattern matching
  // We'll search for titles that start with baseName and contain (Copy
  const allJobs = await db
    .select({ title: jobs.title })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));

  // Filter jobs that match the pattern
  const matchingJobs = allJobs.filter((job) => {
    const title = job.title;
    // Match titles like "BaseName (Copy)" or "BaseName (Copy N)"
    const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(Copy(?:\\s+(\\d+))?\\)$`);
    return pattern.test(title);
  });

  // Find the highest copy number
  let maxCopy = 0;
  for (const job of matchingJobs) {
    const match = job.title.match(/\(Copy(?:\s+(\d+))?\)$/);
    if (match) {
      const num = match[1] ? parseInt(match[1], 10) : 1;
      maxCopy = Math.max(maxCopy, num);
    }
  }

  // Generate new title
  if (maxCopy === 0) {
    return `${baseName} (Copy)`;
  } else {
    return `${baseName} (Copy ${maxCopy + 1})`;
  }
}

/**
 * Duplicates a job with all its tasks in a single transaction.
 * 
 * @param jobId - The job ID to duplicate
 * @param orgId - The organization ID
 * @returns Result containing the duplicated job with tasks or an error
 */
export async function duplicateJobWithTasks(
  jobId: string,
  orgId: string
): Promise<Result<{ job: Job; tasks: Task[] }>> {
  try {
    // Fetch the original job
    const originalJob = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    });

    if (!originalJob) {
      return err('NOT_FOUND', 'Job not found');
    }

    // Fetch all tasks for the job
    const tasksResult = await listTasksForJob(jobId, orgId);
    if (!tasksResult.ok) {
      return err('INTERNAL_ERROR', 'Failed to fetch tasks for duplication', tasksResult.error);
    }

    const originalTasks = tasksResult.data;

    // Generate duplicate title
    const duplicateTitle = await generateDuplicateTitle(originalJob.title, orgId);

    // Prepare new job data (reset status, clear dates)
    const newJobData: CreateJobInput = {
      orgId: originalJob.orgId,
      title: duplicateTitle,
      clientId: originalJob.clientId ?? null,
      addressLine1: originalJob.addressLine1,
      addressLine2: originalJob.addressLine2 || null,
      suburb: originalJob.suburb || null,
      state: originalJob.state || null,
      postcode: originalJob.postcode || null,
      latitude: originalJob.latitude ? parseFloat(originalJob.latitude) : null,
      longitude: originalJob.longitude ? parseFloat(originalJob.longitude) : null,
      status: 'scheduled',
      priority: originalJob.priority,
      scheduledStart: null,
      scheduledEnd: null,
      notes: originalJob.notes || null,
    };

    // Validate job data
    const validatedJob = jobCreateSchema.parse(newJobData);

    // Use database transaction
    // Note: Drizzle transactions automatically rollback on error
    const result = await db.transaction(async (tx) => {
      // Create the new job
      const insertValues: any = {
        ...validatedJob,
        latitude:
          validatedJob.latitude !== null && validatedJob.latitude !== undefined
            ? String(validatedJob.latitude)
            : null,
        longitude:
          validatedJob.longitude !== null && validatedJob.longitude !== undefined
            ? String(validatedJob.longitude)
            : null,
        targetMarginPercent:
          validatedJob.targetMarginPercent === null || validatedJob.targetMarginPercent === undefined
            ? validatedJob.targetMarginPercent
            : String(validatedJob.targetMarginPercent),
        scheduledStart: null,
        scheduledEnd: null,
      };

      const [newJob] = await tx
        .insert(jobs)
        .values(insertValues)
        .returning();

      if (!newJob) {
        throw new Error('Failed to create job in transaction');
      }

      if (DEBUG_JOBS_MUTATIONS) {
        console.log(
          `✅ Duplicated job created: ${newJob.id} with status: ${newJob.status}`
        );
      }

      // Create all tasks
      const newTasks: Task[] = [];
      for (const originalTask of originalTasks) {
        const taskData: CreateTaskInput = {
          jobId: newJob.id,
          orgId: newJob.orgId,
          title: originalTask.title,
          description: originalTask.description || null,
          order: originalTask.order,
          isRequired: originalTask.isRequired,
          status: 'pending',
        };

        const validatedTask = taskCreateSchema.parse(taskData);

        const [newTask] = await tx
          .insert(tasks)
          .values({
            ...validatedTask,
            completedAt: null,
            completedBy: null,
          })
          .returning();

        if (!newTask) {
          throw new Error(`Failed to create task: ${originalTask.title}`);
        }

        newTasks.push(newTask);
      }

      if (DEBUG_JOBS_MUTATIONS) {
        console.log(
          `✅ Duplicated ${newTasks.length} tasks for job ${newJob.id}`
        );
      }

      return { job: newJob, tasks: newTasks };
    });

    return ok(result);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid job or task data', error.errors);
    }

    // Handle database transaction errors
    console.error('Error duplicating job with tasks:', error);
    
    // If it's a database error, provide more context
    if (error instanceof Error) {
      return err('INTERNAL_ERROR', `Failed to duplicate job: ${error.message}`, error);
    }
    
    return err('INTERNAL_ERROR', 'Failed to duplicate job with tasks', error);
  }
}

/**
 * Updates an existing job.
 * 
 * @param input - The update data (will be validated, must include id)
 * @returns Result containing the updated job or an error
 */
export async function updateJob(
  input: UpdateJobInput
): Promise<Result<Job>> {
  try {
    // Validate input with Zod
    const validated = jobUpdateSchema.parse(input);

    // Extract id and orgId for the where clause
    const { id, orgId, ...updateData } = validated;

    // Validate that orgId is present (required for multi-tenant queries)
    if (!orgId) {
      return err('VALIDATION_ERROR', 'orgId is required for job updates');
    }

    // Check if job exists and get current status
    const [existingJob] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.orgId, orgId)))
      .limit(1);

    if (!existingJob) {
      return err('NOT_FOUND', 'Job not found');
    }

    // Prevent crew reassignment for completed jobs
    // Check both validated and input to catch crewId regardless of validation
    const crewIdInRequest = ('crewId' in validated && validated.crewId !== undefined) || ('crewId' in input && input.crewId !== undefined);
    if (crewIdInRequest && existingJob.status === 'completed') {
      return err('VALIDATION_ERROR', 'Completed jobs cannot be reassigned to a different crew');
    }

    // PHASE A: Schedule Mutations Must Be Scoped
    // Detect if this is a schedule operation (only scheduling fields provided, no job core fields)
    const jobCoreFields = [
      'title',
      'addressLine1',
      'addressLine2',
      'suburb',
      'state',
      'postcode',
      'notes',
      'kgEstimate',
      'kgInstalled',
      'latitude',
      'longitude',
      'priority',
      'estimatedRevenueCents',
      'estimatedCostCents',
      'targetMarginPercent',
      'revenueOverrideCents',
      'clientId',
    ];
    const hasJobCoreFields = jobCoreFields.some(field => field in validated || field in input);
    const hasScheduleFields = 
      ('crewId' in validated || 'crewId' in input) ||
      ('scheduledStart' in validated || 'scheduledStart' in input) ||
      ('scheduledEnd' in validated || 'scheduledEnd' in input);
    
    const isScheduleOperation = hasScheduleFields && !hasJobCoreFields;

    // 1-3. Build dbValues field-by-field based ONLY on keys present in the input
    // Do NOT assume full job updates. Do NOT merge existing job data.
    const dbValues: any = {};
    
    // Only include fields that are explicitly provided (not undefined)
    // This ensures PATCH semantics - only update what's provided
    
    // Handle crewId explicitly - ALWAYS set if provided in request (even if null)
    if ('crewId' in validated || 'crewId' in input) {
      const crewIdValue = validated.crewId !== undefined ? validated.crewId : input.crewId;
      dbValues.crewId = crewIdValue ?? null;
    }
    
    // Handle scheduledStart if provided
    if ('scheduledStart' in validated || 'scheduledStart' in input) {
      const scheduledStartValue = validated.scheduledStart !== undefined ? validated.scheduledStart : input.scheduledStart;
      if (scheduledStartValue !== null && scheduledStartValue !== undefined) {
        dbValues.scheduledStart = new Date(scheduledStartValue);
      } else {
        dbValues.scheduledStart = null;
      }
    }
    
    // Handle scheduledEnd if provided
    if ('scheduledEnd' in validated || 'scheduledEnd' in input) {
      const scheduledEndValue = validated.scheduledEnd !== undefined ? validated.scheduledEnd : input.scheduledEnd;
      if (scheduledEndValue !== null && scheduledEndValue !== undefined) {
        dbValues.scheduledEnd = new Date(scheduledEndValue);
      } else {
        dbValues.scheduledEnd = null;
      }
    }
    
    // Handle status if provided (for assignment-level status)
    if ('status' in validated || 'status' in input) {
      const statusValue = validated.status !== undefined ? validated.status : input.status;
      if (statusValue !== undefined) {
        dbValues.status = statusValue;
      }
    }
    
    // Handle job core fields ONLY if provided (not for schedule operations)
    if (!isScheduleOperation) {
      if ('title' in validated || 'title' in input) {
        const titleValue = validated.title !== undefined ? validated.title : input.title;
        if (titleValue !== undefined) {
          dbValues.title = titleValue;
        }
      }
      
      if ('addressLine1' in validated || 'addressLine1' in input) {
        const addressValue = validated.addressLine1 !== undefined ? validated.addressLine1 : input.addressLine1;
        if (addressValue !== undefined) {
          dbValues.addressLine1 = addressValue;
        }
      }
      
      if ('addressLine2' in validated || 'addressLine2' in input) {
        const addressValue = validated.addressLine2 !== undefined ? validated.addressLine2 : input.addressLine2;
        dbValues.addressLine2 = addressValue ?? null;
      }
      
      if ('suburb' in validated || 'suburb' in input) {
        const suburbValue = validated.suburb !== undefined ? validated.suburb : input.suburb;
        dbValues.suburb = suburbValue ?? null;
      }
      
      if ('state' in validated || 'state' in input) {
        const stateValue = validated.state !== undefined ? validated.state : input.state;
        dbValues.state = stateValue ?? null;
      }
      
      if ('postcode' in validated || 'postcode' in input) {
        const postcodeValue = validated.postcode !== undefined ? validated.postcode : input.postcode;
        dbValues.postcode = postcodeValue ?? null;
      }
      
      if ('notes' in validated || 'notes' in input) {
        const notesValue = validated.notes !== undefined ? validated.notes : input.notes;
        dbValues.notes = notesValue ?? null;
      }

      if ('clientId' in validated || 'clientId' in input) {
        const clientIdValue = validated.clientId !== undefined ? validated.clientId : input.clientId;
        if (clientIdValue) {
          const clientCheck = await ensureClientInOrg(orgId, clientIdValue);
          if (!clientCheck.ok) return clientCheck;
        }
        dbValues.clientId = clientIdValue ?? null;
      }
      
      if ('priority' in validated || 'priority' in input) {
        const priorityValue = validated.priority !== undefined ? validated.priority : input.priority;
        if (priorityValue !== undefined) {
          dbValues.priority = priorityValue;
        }
      }
      
      // Convert numeric fields to strings if they exist
      if ('latitude' in validated || 'latitude' in input) {
        const latValue = validated.latitude !== undefined ? validated.latitude : input.latitude;
        if (latValue !== null && latValue !== undefined) {
          dbValues.latitude = String(latValue);
        } else {
          dbValues.latitude = null;
        }
      }
      
      if ('longitude' in validated || 'longitude' in input) {
        const lngValue = validated.longitude !== undefined ? validated.longitude : input.longitude;
        if (lngValue !== null && lngValue !== undefined) {
          dbValues.longitude = String(lngValue);
        } else {
          dbValues.longitude = null;
        }
      }
      
      if ('kgEstimate' in validated || 'kgEstimate' in input) {
        const kgValue = validated.kgEstimate !== undefined ? validated.kgEstimate : input.kgEstimate;
        dbValues.kgEstimate = kgValue ?? null;
      }
      
      if ('kgInstalled' in validated || 'kgInstalled' in input) {
        const kgValue = validated.kgInstalled !== undefined ? validated.kgInstalled : input.kgInstalled;
        dbValues.kgInstalled = kgValue ?? null;
      }

      if ('estimatedRevenueCents' in validated || 'estimatedRevenueCents' in input) {
        const value = validated.estimatedRevenueCents !== undefined ? validated.estimatedRevenueCents : input.estimatedRevenueCents;
        dbValues.estimatedRevenueCents = value ?? null;
      }

      if ('estimatedCostCents' in validated || 'estimatedCostCents' in input) {
        const value = validated.estimatedCostCents !== undefined ? validated.estimatedCostCents : input.estimatedCostCents;
        dbValues.estimatedCostCents = value ?? null;
      }

      if ('targetMarginPercent' in validated || 'targetMarginPercent' in input) {
        const value = validated.targetMarginPercent !== undefined ? validated.targetMarginPercent : input.targetMarginPercent;
        dbValues.targetMarginPercent = value ?? null;
      }

      if ('revenueOverrideCents' in validated || 'revenueOverrideCents' in input) {
        const value = validated.revenueOverrideCents !== undefined ? validated.revenueOverrideCents : input.revenueOverrideCents;
        dbValues.revenueOverrideCents = value ?? null;
      }
    }

    // Always update updated_at
    dbValues.updatedAt = new Date();
    
    // 7. If dbValues is empty (only has updatedAt), throw an explicit error
    const fieldsToUpdate = Object.keys(dbValues).filter(k => k !== 'updatedAt');
    if (fieldsToUpdate.length === 0) {
      return err('VALIDATION_ERROR', 'No fields provided to update');
    }

    // PHASE A: Preserve schedule fields when clearing crew assignment
    // Crew assignment is no longer required for a scheduled job.
    if ('status' in dbValues && dbValues.status === 'unassigned') {
      dbValues.crewId = null;
      if (DEBUG_JOBS_MUTATIONS) {
        console.log('Enforcing unassigned status: cleared crewId only');
      }
    }

    // Enforce required tasks completion before allowing job completion
    if (dbValues.status === 'completed') {
      const checkResult = await checkRequiredTasksCompleted(id, orgId);

      if (!checkResult.ok) {
        return checkResult;
      }

      if (!checkResult.data.allCompleted) {
        return err(
          'VALIDATION_ERROR',
          'Cannot complete job: required tasks are incomplete',
          {
            incompleteTaskIds: checkResult.data.incompleteTaskIds,
          }
        );
      }
    }

    if (DEBUG_JOBS_MUTATIONS) {
      console.log('Updating job in database with dbValues:', {
        id,
        orgId,
        isScheduleOperation,
        fieldsToUpdate,
        dbValues: {
          ...dbValues,
          scheduledStart:
            dbValues.scheduledStart instanceof Date
              ? dbValues.scheduledStart.toISOString()
              : dbValues.scheduledStart,
          scheduledEnd:
            dbValues.scheduledEnd instanceof Date
              ? dbValues.scheduledEnd.toISOString()
              : dbValues.scheduledEnd,
          updatedAt:
            dbValues.updatedAt instanceof Date
              ? dbValues.updatedAt.toISOString()
              : dbValues.updatedAt,
        },
      });
    }

    // 8. Ensure UPDATE ... WHERE id = ? executes successfully
    // CRITICAL: WHERE clause must match by id ONLY
    // No orgId, no crewId, no other conditions - just the job id
    const updateResult = await db
      .update(jobs)
      .set(dbValues)
      .where(eq(jobs.id, id))
      .returning();

    // ADD LOGGING: Log rows affected
    const rowsAffected = updateResult.length;
    if (DEBUG_JOBS_MUTATIONS) {
      console.log('Update result:', {
        id,
        rowsAffected,
        updated: rowsAffected > 0,
      });
    }

    if (rowsAffected === 0) {
      return err('NOT_FOUND', 'Job not found or no rows updated');
    }

    const [updatedJob] = updateResult;

    // PROVE IT WORKS: Query the job again to verify crewId was updated
    const [verifiedJob] = await db
      .select({ id: jobs.id, crewId: jobs.crewId, orgId: jobs.orgId })
      .from(jobs)
      .where(eq(jobs.id, id));

    if (DEBUG_JOBS_MUTATIONS) {
      console.log('Post-update job verification:', verifiedJob);
      console.log('Job updated successfully. Returned job crewId:', updatedJob.crewId);
    }

    if (existingJob.status !== 'completed' && updatedJob.status === 'completed') {
      void recomputeCrewInstallStatsForOrg({ orgId });
    }

    return ok(updatedJob);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid job update input', error.errors);
    }

    console.error('Error updating job:', error);
    return err('INTERNAL_ERROR', 'Failed to update job', error);
  }
}

/**
 * Checks if all required tasks for a job are completed.
 *
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result containing boolean and incomplete task IDs if any
 */
async function checkRequiredTasksCompleted(
  jobId: string,
  orgId: string
): Promise<Result<{ allCompleted: boolean; incompleteTaskIds: string[] }>> {
  try {
    const tasksResult = await listTasksForJob(jobId, orgId);

    if (!tasksResult.ok) {
      return err(
        'INTERNAL_ERROR',
        'Failed to fetch tasks for completion check',
        tasksResult.error
      );
    }

    const taskList = tasksResult.data;
    const requiredTasks = taskList.filter((task) => task.isRequired);
    const incompleteTasks = requiredTasks.filter(
      (task) => task.status !== 'completed'
    );

    return ok({
      allCompleted: incompleteTasks.length === 0,
      incompleteTaskIds: incompleteTasks.map((task) => task.id),
    });
  } catch (error) {
    console.error('Error checking required tasks:', error);
    return err('INTERNAL_ERROR', 'Failed to check required tasks', error);
  }
}

/**
 * Updates job status based on task states.
 * This is a helper that combines derivation and update.
 *
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns Result indicating success or failure (does not return job to avoid circular deps)
 */
export async function syncJobStatusFromTasks(
  jobId: string,
  orgId: string
): Promise<Result<void>> {
  try {
    // Derive the appropriate status
    const derivedStatus = await deriveJobStatusFromTasks(jobId, orgId);

    // Update the job status
    const updateResult = await updateJobStatus(jobId, orgId, derivedStatus);

    if (!updateResult.ok) {
      // Log error but don't fail - task mutation should still succeed
      console.error(
        'Failed to update job status after task mutation:',
        updateResult.error
      );
      return err(
        'JOB_UPDATE_FAILED',
        'Task operation succeeded but job status update failed',
        updateResult.error
      );
    }

    return ok(undefined);
  } catch (error) {
    // Log error but don't fail - task mutation should still succeed
    console.error('Error syncing job status from tasks:', error);
    return err(
      'JOB_UPDATE_FAILED',
      'Task operation succeeded but job status sync failed',
      error
    );
  }
}

/**
 * Updates only the job status.
 * 
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @param status - The new status
 * @returns Result containing the updated job or an error
 */
export async function updateJobStatus(
  jobId: string,
  orgId: string,
  status: JobStatus
): Promise<Result<Job>> {
  try {
    // Validate status with Zod
    const validatedStatus = jobStatusSchema.parse(status);

    // Enforce required tasks completion before allowing job completion
    if (validatedStatus === 'completed') {
      const checkResult = await checkRequiredTasksCompleted(jobId, orgId);

      if (!checkResult.ok) {
        return checkResult;
      }

      if (!checkResult.data.allCompleted) {
        return err(
          'VALIDATION_ERROR',
          'Cannot complete job: required tasks are incomplete',
          {
            incompleteTaskIds: checkResult.data.incompleteTaskIds,
          }
        );
      }
    }

    // Update only status and updated_at
    const [updatedJob] = await db
      .update(jobs)
      .set({
        status: validatedStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)))
      .returning();

    // Check if job was found and updated
    if (!updatedJob) {
      return err('NOT_FOUND', 'Job not found');
    }

    if (validatedStatus === 'completed') {
      void recomputeCrewInstallStatsForOrg({ orgId });
    }

    return ok(updatedJob);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid job status', error.errors);
    }

    console.error('Error updating job status:', error);
    return err('INTERNAL_ERROR', 'Failed to update job status', error);
  }
}

/**
 * Derives job status from task states.
 * 
 * Logic:
 * - If no tasks → 'unassigned'
 * - If all required tasks completed → 'completed'
 * - If any task in_progress or completed → 'in_progress'
 * - Else → 'scheduled'
 * 
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @returns The derived job status
 */
export async function deriveJobStatusFromTasks(
  jobId: string,
  orgId: string
): Promise<JobStatus> {
  try {
    // Fetch all tasks for the job
    const tasksResult = await listTasksForJob(jobId, orgId);

    if (!tasksResult.ok) {
      // If we can't fetch tasks, default to 'scheduled'
      console.error('Error fetching tasks for job status derivation:', tasksResult.error);
      return 'scheduled';
    }

    const taskList = tasksResult.data;

    // If no tasks → unassigned
    if (taskList.length === 0) {
      return 'unassigned';
    }

    // Filter required tasks
    const requiredTasks = taskList.filter((task) => task.isRequired);

    // If all required tasks are completed → completed
    if (
      requiredTasks.length > 0 &&
      requiredTasks.every((task) => task.status === 'completed')
    ) {
      return 'completed';
    }

    // If any task is in_progress or completed → in_progress
    if (
      taskList.some(
        (task) => task.status === 'in_progress' || task.status === 'completed'
      )
    ) {
      return 'in_progress';
    }

    // Default → scheduled
    return 'scheduled';
  } catch (error) {
    console.error('Error deriving job status from tasks:', error);
    // Default to 'scheduled' on error
    return 'scheduled';
  }
}

/**
 * PHASE C3: Deletes a job and all associated tasks.
 * 
 * IMPORTANT: This function does NOT delete schedule assignments.
 * Schedule assignments are managed separately and should be deleted
 * explicitly before deleting a job, or handled via cascade delete.
 * 
 * @param jobId - The job ID (UUID)
 * @param orgId - The organization ID (UUID)
 * @param force - If true, skip assignment check (use with caution)
 * @returns Result indicating success or failure
 */
export async function deleteJob(
  jobId: string,
  orgId: string,
  force: boolean = false
): Promise<Result<void>> {
  try {
    // First, verify the job exists and belongs to the org
    const existingJob = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    });

    if (!existingJob) {
      return err('NOT_FOUND', 'Job not found');
    }

    // PHASE C3: Check for active schedule assignments (unless force is true)
    if (!force) {
      const { scheduleAssignments } = await import('@/db/schema/schedule_assignments');
      const { listScheduleAssignmentsByJobId } = await import('@/lib/queries/schedule_assignments');
      
      const assignmentsResult = await listScheduleAssignmentsByJobId(jobId, orgId);
      if (assignmentsResult.ok && assignmentsResult.data.length > 0) {
        const activeCount = assignmentsResult.data.filter(
          a => a.status !== 'completed' && a.status !== 'cancelled'
        ).length;
        
        if (activeCount > 0) {
          return err(
            'CONFLICT',
            `Cannot delete job: ${activeCount} active schedule assignment${activeCount !== 1 ? 's' : ''} exist. Delete assignments first or use force delete.`
          );
        }
      }
    }

    // Delete all associated tasks first (to avoid foreign key constraint issues)
    await db.delete(tasks).where(eq(tasks.jobId, jobId));

    // Delete the job
    // Note: Schedule assignments will be cascade deleted if foreign key is set up
    const result = await db
      .delete(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)))
      .returning();

    if (result.length === 0) {
      return err('NOT_FOUND', 'Job not found');
    }

    return ok(undefined);
  } catch (error) {
    console.error('Error deleting job:', error);
    return err('INTERNAL_ERROR', 'Failed to delete job', error);
  }
}
