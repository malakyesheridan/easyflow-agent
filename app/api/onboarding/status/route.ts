import { withRoute } from '@/lib/api/withRoute';
import { requireOrgContext } from '@/lib/auth/require';
import { getOrgById } from '@/lib/queries/orgs';
import { ok } from '@/lib/result';

/**
 * GET /api/onboarding/status
 */
export const GET = withRoute(async (req: Request) => {
  const context = await requireOrgContext(req, null);
  if (!context.ok) return context;

  const orgResult = await getOrgById({ orgId: context.data.orgId });
  if (!orgResult.ok) return orgResult;

  return ok({
    onboardingCompleted: orgResult.data.onboardingCompleted ?? false,
    onboardingStep: orgResult.data.onboardingStep ?? 1,
  });
});
