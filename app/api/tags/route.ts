import { z } from 'zod';
import { and, eq, ilike } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { tags } from '@/db/schema/tags';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
});

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const search = searchParams.get('q')?.trim() ?? '';
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const db = getDb();
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(
      search
        ? and(eq(tags.orgId, context.data.orgId), ilike(tags.name, `%${search}%`))
        : eq(tags.orgId, context.data.orgId)
    )
    .orderBy(tags.name);

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      color: row.color ?? null,
    }))
  );
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const db = getDb();
  const [inserted] = await db
    .insert(tags)
    .values({
      orgId: context.data.orgId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: tags.id, name: tags.name, color: tags.color });

  if (!inserted) {
    const [existing] = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(and(eq(tags.orgId, context.data.orgId), eq(tags.name, parsed.data.name)))
      .limit(1);

    if (!existing) return err('INTERNAL_ERROR', 'Failed to create tag');
    return ok({ id: String(existing.id), name: existing.name, color: existing.color ?? null });
  }

  return ok({ id: String(inserted.id), name: inserted.name, color: inserted.color ?? null });
});
