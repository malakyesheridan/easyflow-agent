import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getOrgById } from '@/lib/queries/orgs';
import { updateOrg } from '@/lib/mutations/orgs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { listJobTypes } from '@/lib/queries/job_types';
import { listWorkTemplates } from '@/lib/queries/work_templates';
import { listCrewMembers } from '@/lib/queries/crew_members';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { upsertOrgSettings } from '@/lib/mutations/org_settings';
import { seedCommDefaults } from '@/lib/communications/seed';
import { withCommOrgScope } from '@/lib/communications/scope';

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
    const [jobTypesResult, templatesResult, crewResult] = await Promise.all([
      listJobTypes({ orgId: context.data.orgId, includeArchived: false }),
      listWorkTemplates({ orgId: context.data.orgId, includeArchived: false }),
      listCrewMembers({ orgId: context.data.orgId, activeOnly: true }),
    ]);

    if (!jobTypesResult.ok) return jobTypesResult;
    if (jobTypesResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one job type is required to complete onboarding.');
    }

    if (!templatesResult.ok) return templatesResult;
    if (templatesResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one work template is required to complete onboarding.');
    }

    const jobTypeIds = new Set(jobTypesResult.data.map((type) => type.id));
    const templateJobTypeIds = new Set(
      templatesResult.data.map((template) => template.jobTypeId).filter(Boolean) as string[]
    );
    const missingTemplateTypes = jobTypesResult.data.filter((type) => !templateJobTypeIds.has(type.id));
    if (missingTemplateTypes.length > 0) {
      return err(
        'VALIDATION_ERROR',
        `Missing work templates for: ${missingTemplateTypes.map((type) => type.label).join(', ')}`
      );
    }

    if (!crewResult.ok) return crewResult;
    if (crewResult.data.length === 0) {
      return err('VALIDATION_ERROR', 'At least one active crew member is required to complete onboarding.');
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
