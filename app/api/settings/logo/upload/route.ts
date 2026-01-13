import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { canManageOrgSettings } from '@/lib/authz';
import { updateOrgLogoPath } from '@/lib/mutations/org_settings';
import { updateOrg } from '@/lib/mutations/orgs';
import { storeUpload } from '@/lib/uploads/storage';
import { requireOrgContext } from '@/lib/auth/require';
import { getOrgById } from '@/lib/queries/orgs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

export const runtime = 'nodejs';

/**
 * POST /api/settings/logo/upload (multipart/form-data)
 * Fields: orgId, file
 */
export const POST = withRoute(async (req: Request) => {
  const form = await req.formData();
  const orgId = String(form.get('orgId') || '');
  const file = form.get('file');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!(file instanceof File)) return err('VALIDATION_ERROR', 'file is required');

  const actor = context.data.actor;
  if (!canManageOrgSettings(actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const fileType = file.type?.toLowerCase?.() ?? '';
  const fileName = file.name ?? '';
  const isSupported =
    fileType === 'image/png' ||
    fileType === 'image/jpeg' ||
    fileType === 'image/jpg' ||
    (!fileType && /\.(png|jpe?g)$/i.test(fileName));
  if (!isSupported) return err('VALIDATION_ERROR', 'Only PNG or JPEG logos are supported.');

  let storagePath: string;
  try {
    const stored = await storeUpload({ orgId: context.data.orgId, namespace: 'org-branding', file });
    storagePath = stored.storagePath;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return err('INTERNAL_ERROR', message);
  }

  const before = await getOrgById({ orgId: context.data.orgId });
  const orgResult = await updateOrg({ id: context.data.orgId, logoPath: storagePath });
  if (!orgResult.ok) return orgResult;

  const result = await updateOrgLogoPath({ orgId: context.data.orgId, companyLogoPath: storagePath });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'SETTINGS_CHANGE',
      entityType: 'org',
      entityId: context.data.orgId,
      before: before.ok ? before.data : null,
      after: orgResult.data,
      metadata: buildAuditMetadata(req, { logoPath: storagePath }),
    });
  }
  return result;
});
