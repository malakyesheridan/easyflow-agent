# Feature Implementation Framework

This document defines the mandatory contract that **every feature** in this codebase MUST follow. This is the source of truth for architectural decisions.

## A. Feature = Domain

**Features represent domains, not random screens.**

- ✅ Valid: `jobs`, `schedule`, `tasks`, `warehouse`, `announcements`, `kpis`
- ❌ Invalid: `job-list`, `create-job`, `job-details` (these are UI screens, not domains)

Each feature is a complete domain with its own data model, business logic, and UI.

## B. Required Layer Order (MUST Always Be Followed)

When implementing a feature, you MUST follow this exact order:

1. **Data Layer** (Drizzle schema + Zod validators)
2. **Data Access Layer** (queries/mutations)
3. **API Layer** (Route Handlers only if needed)
4. **UI Layer** (pages + feature components)
5. **State Layer** (Zustand, if needed)
6. **Realtime Layer** (if needed)
7. **Tests** (future)

**Never skip layers or implement them out of order.**

## C. Allowed File Touch List Per Layer

### Data Layer

You may ONLY touch:
- `db/schema/<feature>.ts` - Drizzle schema definition
- `lib/validators/<feature>.ts` - Zod validation schemas
- `lib/validators/index.ts` - Export validators
- `db/schema/index.ts` - Export schema

**Example:** For `jobs` feature:
- `db/schema/jobs.ts`
- `lib/validators/jobs.ts`
- Update `lib/validators/index.ts` to export
- Update `db/schema/index.ts` to export

### Queries/Mutations Layer

You may ONLY touch:
- `lib/queries/<feature>.ts` - Read operations
- `lib/mutations/<feature>.ts` - Write operations

**Example:** For `jobs` feature:
- `lib/queries/jobs.ts`
- `lib/mutations/jobs.ts`

### API Layer (Optional)

You may ONLY touch:
- `app/api/<feature>/route.ts` - Thin route handler wrapper

**Rules:**
- Route handlers contain **NO business logic**
- They call `lib/queries/*` or `lib/mutations/*`
- They use `withRoute()` wrapper from `lib/api/withRoute.ts`

**Example:** For `jobs` feature:
- `app/api/jobs/route.ts`

### UI Layer

You may ONLY touch:
- `app/<feature>/**` - Pages and route segments
- `components/<feature>/**` - Feature-specific components

**Example:** For `jobs` feature:
- `app/jobs/page.tsx`
- `app/jobs/[id]/page.tsx`
- `components/jobs/JobCard.tsx`
- `components/jobs/JobForm.tsx`

### State Layer (If Needed)

You may ONLY touch:
- `hooks/use<Feature>Store.ts` - Zustand store

**Example:** For `jobs` feature:
- `hooks/useJobsStore.ts`

### Realtime Layer (If Needed)

You may ONLY touch:
- `lib/realtime/<feature>.ts` - Realtime subscriptions

**Example:** For `jobs` feature:
- `lib/realtime/jobs.ts`

## D. Hard Rules

### 1. UI Never Imports Drizzle or DB Code

❌ **FORBIDDEN:**
```typescript
// components/jobs/JobCard.tsx
import { db } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
```

✅ **CORRECT:**
```typescript
// components/jobs/JobCard.tsx
import { getJobs } from '@/lib/queries/jobs';
// or use API route
```

### 2. Route Handlers Contain No Business Logic

❌ **FORBIDDEN:**
```typescript
// app/api/jobs/route.ts
export async function POST(req: Request) {
  const data = await req.json();
  // Business logic here - WRONG!
  const result = await db.insert(jobs).values(data);
  return Response.json(result);
}
```

✅ **CORRECT:**
```typescript
// app/api/jobs/route.ts
import { withRoute } from '@/lib/api/withRoute';
import { createJob } from '@/lib/mutations/jobs';

export const POST = withRoute(async (req) => {
  const data = await req.json();
  return await createJob(data);
});
```

### 3. All Inputs Validated with Zod

Every function that accepts user input MUST validate with Zod:

```typescript
// lib/validators/jobs.ts
import { z } from 'zod';

export const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

// lib/mutations/jobs.ts
import { createJobSchema } from '@/lib/validators/jobs';

export async function createJob(input: unknown) {
  const validated = createJobSchema.parse(input);
  // ... rest of logic
}
```

### 4. All Server Logic Returns Result<T>

Every query/mutation MUST return `Result<T>`:

```typescript
import { Result, ok, err } from '@/lib/result';

export async function getJob(id: string): Promise<Result<Job>> {
  try {
    const job = await db.query.jobs.findFirst({ where: eq(jobs.id, id) });
    if (!job) {
      return err('NOT_FOUND', 'Job not found');
    }
    return ok(job);
  } catch (error) {
    return err('DATABASE_ERROR', 'Failed to fetch job', error);
  }
}
```

### 5. No Mixed Patterns

Once you choose a pattern for a feature, use it consistently:
- If you use API routes, use them for all operations
- If you use Server Actions, use them consistently
- Don't mix `fetch()` calls with direct imports

## E. Error Handling

### Result<T> Type

```typescript
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };
```

### AppError Type

```typescript
type AppError = {
  code: string;
  message: string;
  details?: unknown;
};
```

### Rules

1. **Expected errors** return `{ ok: false }` - **DO NOT throw**
   ```typescript
   if (!user) {
     return err('NOT_FOUND', 'User not found');
   }
   ```

2. **Unexpected errors** are caught at boundaries and logged
   ```typescript
   try {
     // operation
   } catch (error) {
     console.error('Unexpected error:', error);
     return err('INTERNAL_ERROR', 'An unexpected error occurred', error);
   }
   ```

3. **UI displays safe messages only**
   - Never expose internal error details to users
   - Show user-friendly messages based on error codes

## F. Data Fetching Strategy

### Server Components

Prefer server-side calls when possible:

```typescript
// app/jobs/page.tsx (Server Component)
import { getJobs } from '@/lib/queries/jobs';

export default async function JobsPage() {
  const result = await getJobs();
  if (!result.ok) {
    // Handle error
  }
  return <div>{/* render jobs */}</div>;
}
```

### Client Components

Use TanStack Query only for:
- Client-side caching
- Optimistic updates
- Realtime refresh

```typescript
// components/jobs/JobList.tsx (Client Component)
'use client';
import { useQuery } from '@tanstack/react-query';

export function JobList() {
  const { data } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await fetch('/api/jobs');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data;
    },
  });
  // ...
}
```

### Avoid Mixed Patterns

❌ Don't mix `fetch()` in some places and direct imports in others for the same feature.

## G. Realtime Strategy

### Subscriptions Live in lib/realtime/<feature>.ts

```typescript
// lib/realtime/jobs.ts
import { createClientSupabase } from '@/lib/supabase';

export function subscribeToJobs(callback: (payload: any) => void) {
  const supabase = createClientSupabase();
  const channel = supabase
    .channel('jobs-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'jobs',
    }, callback)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
```

### Realtime Emits Events; UI Reacts Only

- Realtime subscriptions emit typed events
- UI components subscribe and react
- UI never writes directly to database via realtime

## H. Commit Discipline

**Each completed layer = one commit.**

Example commit sequence for `jobs` feature:
1. `feat(jobs): add schema and validators`
2. `feat(jobs): add queries and mutations`
3. `feat(jobs): add API route handlers`
4. `feat(jobs): add UI pages and components`
5. `feat(jobs): add Zustand store`
6. `feat(jobs): add realtime subscriptions`

This makes code review easier and allows for incremental progress.

---

## Summary

- Features = Domains
- Follow layer order strictly
- Only touch allowed files per layer
- UI never imports DB code
- Route handlers are thin wrappers
- All inputs validated with Zod
- All server logic returns Result<T>
- Use consistent patterns
- Handle errors with Result<T>
- Commit per layer

**Violating these rules is not allowed. This framework ensures consistency and maintainability.**

