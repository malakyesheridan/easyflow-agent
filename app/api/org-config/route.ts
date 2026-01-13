import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { getOrgById } from '@/lib/queries/orgs';
import { listJobTypes } from '@/lib/queries/job_types';
import { listOrgRoles } from '@/lib/queries/org_roles';
import { buildOrgConfig } from '@/lib/org/orgConfig';

/**
 * GET /api/org-config?orgId=...
 * Returns org-scoped configuration used across the UI.
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const resolvedOrgId = context.data.orgId;
  const [orgResult, settingsResult, jobTypesResult, rolesResult] = await Promise.all([
    getOrgById({ orgId: resolvedOrgId }),
    getOrgSettings({ orgId: resolvedOrgId }),
    listJobTypes({ orgId: resolvedOrgId }),
    listOrgRoles({ orgId: resolvedOrgId }),
  ]);

  if (!orgResult.ok) return err('INTERNAL_ERROR', 'Failed to load organisation', orgResult.error);
  if (!jobTypesResult.ok) return err('INTERNAL_ERROR', 'Failed to load job types', jobTypesResult.error);
  if (!rolesResult.ok) return err('INTERNAL_ERROR', 'Failed to load roles', rolesResult.error);

  const config = buildOrgConfig({
    orgId: resolvedOrgId,
    org: orgResult.data,
    settings: settingsResult.ok ? settingsResult.data : null,
    jobTypes: jobTypesResult.data,
    roles: rolesResult.data,
  });

  return ok(config);
});
