# Feature Queries Template

This template shows the exact pattern to follow when creating query functions in `lib/queries/<feature>.ts`.

## Pattern

```typescript
import { db } from '@/lib/db';
import { eq, and, or } from 'drizzle-orm';
import { ok, err } from '@/lib/result';
import type { Result } from '@/lib/result';
// Import your schema
import { jobs } from '@/db/schema/jobs';
// Import types if needed
import type { Job } from '@/db/schema/jobs';

/**
 * Retrieves a single job by ID.
 * 
 * @param id - The job ID
 * @returns Result containing the job or an error
 */
export async function getJob(id: string): Promise<Result<Job>> {
  try {
    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });

    if (!job) {
      return err('NOT_FOUND', `Job with ID ${id} not found`);
    }

    return ok(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    return err('DATABASE_ERROR', 'Failed to fetch job', error);
  }
}

/**
 * Retrieves all jobs, optionally filtered.
 * 
 * @param filters - Optional filters
 * @returns Result containing array of jobs or an error
 */
export async function listJobs(filters?: {
  status?: string;
  crewId?: string;
}): Promise<Result<Job[]>> {
  try {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(jobs.status, filters.status));
    }
    
    if (filters?.crewId) {
      conditions.push(eq(jobs.crewId, filters.crewId));
    }

    const jobsList = await db.query.jobs.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
    });

    return ok(jobsList);
  } catch (error) {
    console.error('Error listing jobs:', error);
    return err('DATABASE_ERROR', 'Failed to list jobs', error);
  }
}
```

## Key Points

1. **Always return `Result<T>`** - Never throw exceptions
2. **Use try/catch** - Catch unexpected errors and convert to `Result`
3. **Validate inputs** - Check for null/undefined before querying
4. **Use descriptive error codes** - e.g., 'NOT_FOUND', 'DATABASE_ERROR'
5. **Log errors** - Use `console.error` for debugging
6. **JSDoc comments** - Document all public functions
7. **Type imports** - Import types explicitly for clarity

## Error Codes

Common error codes to use:
- `NOT_FOUND` - Resource doesn't exist
- `DATABASE_ERROR` - Unexpected database error
- `VALIDATION_ERROR` - Input validation failed (if validating in query)
- `UNAUTHORIZED` - User not authorized (if checking permissions)

