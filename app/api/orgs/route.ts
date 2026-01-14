import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getOrgById } from '@/lib/queries/orgs';
import { updateOrg } from '@/lib/mutations/orgs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { upsertOrgSettings } from '@/lib/mutations/org_settings';
import { seedCommDefaults } from '@/lib/communications/seed';
import { withCommOrgScope } from '@/lib/communications/scope';
import { listBuyerPipelineStages } from '@/lib/queries/buyer_pipeline_stages';
import { listListingPipelineStages } from '@/lib/queries/listing_pipeline_stages';
import { getMatchingConfig } from '@/lib/queries/matching_config';
import { listReportTemplates } from '@/lib/queries/report_templates';

/**
 * GET /api/orgs?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  return await getOrgById({ orgId: context.data.orgId });
});

/**
 * PATCH /api/orgs
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  if (body?.onboardingCompleted === true) {
    const [buyerStagesResult, listingStagesResult, matchingConfigResult, reportTemplatesResult] = await Promise.all([
      listBuyerPipelineStages({ orgId: context.data.orgId }),
      listListingPipelineStages({ orgId: context.data.orgId }),
      getMatchingConfig({ orgId: context.data.orgId }),
      listReportTemplates({ orgId: context.data.orgId, templateType: 'vendor' }),
    ]);

    if (!buyerStagesResult.ok) return buyerStagesResult;
    if (buyerStagesResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one buyer pipeline stage is required to complete onboarding.');
    }

    if (!listingStagesResult.ok) return listingStagesResult;
    if (listingStagesResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one listing pipeline stage is required to complete onboarding.');
    }

    if (!matchingConfigResult.ok) return matchingConfigResult;
    if (!matchingConfigResult.data) {
      return err('VALIDATION_ERROR', 'Matching configuration is required to complete onboarding.');
    }

    if (!reportTemplatesResult.ok) return reportTemplatesResult;
    if (reportTemplatesResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one vendor report template is required to complete onboarding.');
    }

    const settingsResult = await getOrgSettings({ orgId: context.data.orgId });
    if (!settingsResult.ok) return settingsResult;
    if (!settingsResult.data?.timezone) {
      const timezone = process.env.DEFAULT_ORG_TIMEZONE || 'UTC';
      const upsertResult = await upsertOrgSettings({ orgId: context.data.orgId, timezone });
      if (!upsertResult.ok) return upsertResult;
    }

    await withCommOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (tx) => {
      await seedCommDefaults(tx as any, context.data.orgId);
    });
  }

  const before = await getOrgById({ orgId: context.data.orgId });
  const result = await updateOrg({ ...body, id: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'SETTINGS_CHANGE',
      entityType: 'org',
      entityId: context.data.orgId,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});
