# Feature Validator Template

This template shows the exact pattern to follow when creating Zod validators in `lib/validators/<feature>.ts`.

## Pattern

```typescript
import { z } from 'zod';

/**
 * Schema for creating a new job.
 */
export const createJobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().datetime().optional(),
  crewId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  location: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
});

/**
 * Schema for updating a job.
 * All fields are optional (partial update).
 */
export const updateJobSchema = createJobSchema.partial();

/**
 * Schema for query parameters when listing jobs.
 */
export const listJobsQuerySchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  crewId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Schema for job ID parameter.
 */
export const jobIdSchema = z.object({
  id: z.string().uuid(),
});

// Export inferred types
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type JobIdParams = z.infer<typeof jobIdSchema>;
```

## Key Points

1. **Use descriptive names** - `createJobSchema`, `updateJobSchema`, etc.
2. **Reuse schemas** - Use `.partial()` for update schemas
3. **Provide defaults** - Use `.default()` for optional fields with defaults
4. **Add validation messages** - Use second parameter for custom error messages
5. **Export types** - Use `z.infer<>` to export TypeScript types
6. **Validate UUIDs** - Use `.uuid()` for ID fields
7. **Validate enums** - Use `z.enum()` for fixed value sets
8. **Coerce query params** - Use `z.coerce` for query string parameters

## Common Patterns

### Optional Fields
```typescript
description: z.string().optional(),
```

### Required with Default
```typescript
priority: z.enum(['low', 'medium', 'high']).default('medium'),
```

### Nested Objects
```typescript
location: z.object({
  address: z.string(),
  city: z.string(),
}),
```

### Arrays
```typescript
tags: z.array(z.string()).optional(),
```

### Dates
```typescript
// ISO datetime string
dueDate: z.string().datetime().optional(),

// Or Date object (if needed)
createdAt: z.date().optional(),
```

### Query Parameters
```typescript
// Use z.coerce for query params (they come as strings)
page: z.coerce.number().int().positive().default(1),
limit: z.coerce.number().int().positive().max(100).default(20),
```

### UUID Validation
```typescript
id: z.string().uuid(),
```

### Email Validation
```typescript
email: z.string().email(),
```

## Usage in Mutations

```typescript
// lib/mutations/jobs.ts
import { createJobSchema } from '@/lib/validators/jobs';

export async function createJob(input: unknown) {
  // Validate
  const validated = createJobSchema.parse(input);
  // validated is now typed as CreateJobInput
  // ...
}
```

## Usage in Route Handlers

```typescript
// app/api/jobs/route.ts
import { listJobsQuerySchema } from '@/lib/validators/jobs';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const query = listJobsQuerySchema.parse({
    status: searchParams.get('status'),
    crewId: searchParams.get('crewId'),
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
  });
  // query is now typed as ListJobsQuery
  // ...
});
```

## Error Handling

Zod will throw `ZodError` if validation fails. Catch it in mutations:

```typescript
try {
  const validated = createJobSchema.parse(input);
} catch (error) {
  if (error instanceof z.ZodError) {
    return err('VALIDATION_ERROR', 'Invalid input', error.errors);
  }
  throw error;
}
```

