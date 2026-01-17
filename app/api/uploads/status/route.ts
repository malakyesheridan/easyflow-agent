import { withRoute } from '@/lib/api/withRoute';
import { ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const hasBucket = Boolean(process.env.SUPABASE_STORAGE_BUCKET?.trim());
  const enabled = hasUrl && hasServiceRole && hasBucket;

  return ok({
    enabled,
    missing: {
      url: !hasUrl,
      serviceRole: !hasServiceRole,
      bucket: !hasBucket,
    },
  });
});
