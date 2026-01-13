# Feature Route Template

This template shows the exact pattern to follow when creating API route handlers in `app/api/<feature>/route.ts`.

## Pattern

```typescript
import { withRoute } from '@/lib/api/withRoute';
import { createJob, updateJob, deleteJob } from '@/lib/mutations/jobs';
import { getJob, listJobs } from '@/lib/queries/jobs';
import { err } from '@/lib/result';

/**
 * GET /api/jobs
 * Retrieves all jobs or a single job by ID.
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Get single job
    return await getJob(id);
  }

  // List all jobs
  const status = searchParams.get('status') || undefined;
  const crewId = searchParams.get('crewId') || undefined;

  return await listJobs({ status, crewId });
});

/**
 * POST /api/jobs
 * Creates a new job.
 */
export const POST = withRoute(async (req: Request) => {
  const data = await req.json();
  return await createJob(data);
});

/**
 * PUT /api/jobs
 * Updates an existing job.
 * Requires 'id' query parameter.
 */
export const PUT = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return err('VALIDATION_ERROR', 'Missing required parameter: id');
  }

  const data = await req.json();
  return await updateJob(id, data);
});

/**
 * DELETE /api/jobs
 * Deletes a job.
 * Requires 'id' query parameter.
 */
export const DELETE = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return err('VALIDATION_ERROR', 'Missing required parameter: id');
  }

  return await deleteJob(id);
});
```

## Alternative: Using Dynamic Routes

For RESTful routes like `/api/jobs/[id]`, use this pattern:

```typescript
// app/api/jobs/[id]/route.ts
import { withRoute } from '@/lib/api/withRoute';
import { getJob, updateJob, deleteJob } from '@/lib/mutations/jobs';

export const GET = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  return await getJob(params.id);
});

export const PUT = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const data = await req.json();
  return await updateJob(params.id, data);
});

export const DELETE = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  return await deleteJob(params.id);
});
```

## Key Points

1. **Use `withRoute()` wrapper** - Provides consistent error handling
2. **No business logic** - Route handlers only call queries/mutations
3. **Parse request data** - Use `req.json()` for POST/PUT
4. **Extract query params** - Use `URL` constructor for query parameters
5. **Validate required params** - Return error if required params missing
6. **One handler per HTTP method** - Export GET, POST, PUT, DELETE as needed
7. **Return Result<T>** - Queries/mutations return Result, which withRoute handles

## Response Format

All responses follow this format:

**Success:**
```json
{
  "ok": true,
  "data": { /* your data */ }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": { /* optional */ }
  }
}
```

## When to Use API Routes

Use API routes when:
- You need RESTful endpoints
- Client components need to fetch data
- You're integrating with external services
- You need webhook endpoints

Consider Server Actions instead if:
- You're only using server components
- You want simpler form handling
- You don't need RESTful endpoints

