# Feature Mutations Template

This template shows the exact pattern to follow when creating mutation functions in `lib/mutations/<feature>.ts`.

## Pattern

```typescript
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
// Import your schema
import { jobs } from '@/db/schema/jobs';
// Import validators
import { createJobSchema, updateJobSchema } from '@/lib/validators/jobs';
// Import types
import type { Job } from '@/db/schema/jobs';

/**
 * Creates a new job.
 * 
 * @param input - The job data (will be validated)
 * @returns Result containing the created job or an error
 */
export async function createJob(input: unknown): Promise<Result<Job>> {
  try {
    // Validate input with Zod
    const validated = createJobSchema.parse(input);

    // Perform the mutation
    const [newJob] = await db
      .insert(jobs)
      .values(validated)
      .returning();

    return ok(newJob);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err(
        'VALIDATION_ERROR',
        'Invalid job data',
        error.errors
      );
    }

    // Handle other errors
    console.error('Error creating job:', error);
    return err('DATABASE_ERROR', 'Failed to create job', error);
  }
}

/**
 * Updates an existing job.
 * 
 * @param id - The job ID
 * @param input - The update data (will be validated)
 * @returns Result containing the updated job or an error
 */
export async function updateJob(
  id: string,
  input: unknown
): Promise<Result<Job>> {
  try {
    // Validate input
    const validated = updateJobSchema.parse(input);

    // Check if job exists
    const existing = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });

    if (!existing) {
      return err('NOT_FOUND', `Job with ID ${id} not found`);
    }

    // Perform the update
    const [updatedJob] = await db
      .update(jobs)
      .set(validated)
      .where(eq(jobs.id, id))
      .returning();

    return ok(updatedJob);
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return err(
        'VALIDATION_ERROR',
        'Invalid job update data',
        error.errors
      );
    }

    console.error('Error updating job:', error);
    return err('DATABASE_ERROR', 'Failed to update job', error);
  }
}

/**
 * Deletes a job.
 * 
 * @param id - The job ID
 * @returns Result containing success or an error
 */
export async function deleteJob(id: string): Promise<Result<void>> {
  try {
    // Check if job exists
    const existing = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });

    if (!existing) {
      return err('NOT_FOUND', `Job with ID ${id} not found`);
    }

    // Perform the deletion
    await db.delete(jobs).where(eq(jobs.id, id));

    return ok(undefined);
  } catch (error) {
    console.error('Error deleting job:', error);
    return err('DATABASE_ERROR', 'Failed to delete job', error);
  }
}
```

## Key Points

1. **Always validate input** - Use Zod schemas from `lib/validators/<feature>.ts`
2. **Always return `Result<T>`** - Never throw exceptions
3. **Check existence** - For updates/deletes, verify resource exists first
4. **Handle Zod errors** - Catch `ZodError` and return validation error
5. **Use descriptive error codes** - e.g., 'VALIDATION_ERROR', 'NOT_FOUND'
6. **Log errors** - Use `console.error` for debugging
7. **JSDoc comments** - Document all public functions
8. **Use `.returning()`** - Return the created/updated record

## Error Codes

Common error codes to use:
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Resource doesn't exist
- `DATABASE_ERROR` - Unexpected database error
- `CONFLICT` - Resource conflict (e.g., duplicate)
- `UNAUTHORIZED` - User not authorized

## Import ZodError

Don't forget to import `z` from 'zod':

```typescript
import { z } from 'zod';
```

