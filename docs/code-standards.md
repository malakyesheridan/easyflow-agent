# Code Standards

Enforceable code rules for the TGW Operations platform.

## Naming Conventions

### Files

- **Schemas**: `db/schema/<feature>.ts` (snake_case for multi-word: `stock_items.ts`)
- **Validators**: `lib/validators/<feature>.ts`
- **Queries**: `lib/queries/<feature>.ts`
- **Mutations**: `lib/mutations/<feature>.ts`
- **Components**: `components/<feature>/<ComponentName>.tsx` (PascalCase)
- **Hooks**: `hooks/use<Feature>Store.ts` (camelCase, PascalCase for feature)
- **Pages**: `app/<feature>/page.tsx` or `app/<feature>/[id]/page.tsx`

### Functions

- **Queries**: `get<Entity>`, `list<Entities>`, `find<Entity>`
  - Example: `getJob`, `listJobs`, `findJobById`
- **Mutations**: `create<Entity>`, `update<Entity>`, `delete<Entity>`
  - Example: `createJob`, `updateJob`, `deleteJob`
- **Validators**: `<action><Entity>Schema`
  - Example: `createJobSchema`, `updateJobSchema`

### Types

- **Entities**: PascalCase matching database table name
  - Example: `Job`, `Task`, `Crew`
- **Inputs**: `<Action><Entity>Input`
  - Example: `CreateJobInput`, `UpdateJobInput`
- **Results**: Use `Result<T>` from `@/lib/result`

## No Silent Failures

❌ **FORBIDDEN:**
```typescript
try {
  await someOperation();
} catch {
  // Silent failure - WRONG!
}
```

✅ **CORRECT:**
```typescript
try {
  await someOperation();
} catch (error) {
  console.error('Operation failed:', error);
  return err('OPERATION_FAILED', 'Failed to perform operation', error);
}
```

**Every error must be:**
1. Logged (for debugging)
2. Returned as `Result<T>` (for handling)
3. Displayed to user (if user-facing)

## No Ad-Hoc Fetch

❌ **FORBIDDEN:**
```typescript
// components/jobs/JobList.tsx
export function JobList() {
  const [jobs, setJobs] = useState([]);
  
  useEffect(() => {
    fetch('/api/jobs').then(r => r.json()).then(setJobs);
  }, []);
  // ...
}
```

✅ **CORRECT:**
```typescript
// Use TanStack Query
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

**Or use server components:**
```typescript
// app/jobs/page.tsx (Server Component)
import { getJobs } from '@/lib/queries/jobs';

export default async function JobsPage() {
  const result = await getJobs();
  // ...
}
```

## No Config Edits Without Instruction

**DO NOT modify these files unless explicitly asked:**
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config
- `tailwind.config.ts` - Tailwind config
- `next.config.js` - Next.js config
- `drizzle.config.ts` - Drizzle config
- `.eslintrc.json` - ESLint config

**Exception:** Adding new dependencies when implementing a feature that requires them (but this should be discussed first).

## TypeScript Strictness Rules

### No `any` Type

❌ **FORBIDDEN:**
```typescript
function processData(data: any) {
  // ...
}
```

✅ **CORRECT:**
```typescript
function processData(data: unknown) {
  // Validate with Zod first
  const validated = schema.parse(data);
  // ...
}
```

### Allowed `any` Exceptions

Currently, the following exceptions are documented:

1. **Supabase Realtime Callbacks**: `lib/realtime/**/*.ts`
   - Supabase payload types are complex and may require `any` until proper types are generated
   - Example: `callback: (payload: any) => void`
   - **Note:** This should be replaced with proper types when available

**All other uses of `any` are forbidden.**

### Use `unknown` for Untrusted Input

When receiving data from external sources (API, user input, etc.), use `unknown`:

```typescript
export async function createJob(input: unknown): Promise<Result<Job>> {
  // Validate with Zod
  const validated = createJobSchema.parse(input);
  // Now validated is typed
}
```

### Strict Null Checks

TypeScript strict mode is enabled. Always handle null/undefined:

```typescript
// ❌ WRONG
function getJob(id: string) {
  return db.query.jobs.findFirst({ where: eq(jobs.id, id) });
  // Could return undefined!
}

// ✅ CORRECT
async function getJob(id: string): Promise<Result<Job>> {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, id) });
  if (!job) {
    return err('NOT_FOUND', 'Job not found');
  }
  return ok(job);
}
```

## One Feature at a Time

**Implement features sequentially, not in parallel.**

- Complete one feature fully (all layers) before starting another
- This prevents:
  - Incomplete implementations
  - Merge conflicts
  - Architectural inconsistencies

**Exception:** Bug fixes and small improvements can be done in parallel.

## Function Documentation

### Public Functions Must Have JSDoc

```typescript
/**
 * Retrieves a job by ID.
 * 
 * @param id - The job ID
 * @returns Result containing the job or an error
 */
export async function getJob(id: string): Promise<Result<Job>> {
  // ...
}
```

### Complex Logic Must Have Comments

```typescript
// Calculate total cost including tax
// Tax rate is 10% for jobs over $1000
const tax = baseCost > 1000 ? baseCost * 0.1 : 0;
const total = baseCost + tax;
```

## Import Organization

### Import Order

1. External libraries
2. Internal utilities (`@/lib/*`)
3. Types
4. Relative imports

```typescript
// External
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// Internal utilities
import { db } from '@/lib/db';
import { ok, err } from '@/lib/result';

// Types
import type { Job } from '@/db/schema/jobs';

// Relative
import { createJobSchema } from './validators';
```

## Summary

- Follow naming conventions strictly
- Never allow silent failures
- No ad-hoc fetch calls
- Don't edit configs without instruction
- No `any` except documented exceptions
- Use `unknown` for untrusted input
- Handle null/undefined properly
- One feature at a time
- Document public functions
- Organize imports consistently

**These rules are non-negotiable. Violations will be caught in code review.**

