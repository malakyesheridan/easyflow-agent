import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgSettings, type OrgSettings, type NewOrgSettings } from '@/db/schema/org_settings';
import { ok, err, type Result } from '@/lib/result';
import { getAllowedFromDomains, isAllowedFromEmail } from '@/lib/communications/sender';
import { orgSettingsUpdateSchema, type OrgSettingsUpdateInput } from '@/lib/validators/org_settings';

export async function upsertOrgSettings(input: OrgSettingsUpdateInput): Promise<Result<OrgSettings>> {
  try {
    const validated = orgSettingsUpdateSchema.parse(input);
    const db = getDb();
    if (validated.commFromEmail) {
      const allowedDomains = getAllowedFromDomains();
      if (!isAllowedFromEmail(validated.commFromEmail, allowedDomains)) {
        return err(
          'VALIDATION_ERROR',
          `From email domain must be one of: ${allowedDomains.length > 0 ? allowedDomains.join(', ') : 'configured domains'}`
        );
      }
    }

    const values: NewOrgSettings = {
      orgId: validated.orgId,
      companyName: validated.companyName === undefined ? undefined : validated.companyName,
      companyLogoPath: validated.companyLogoPath === undefined ? undefined : validated.companyLogoPath,
      timezone: validated.timezone === undefined ? undefined : validated.timezone,
      businessType: validated.businessType === undefined ? undefined : validated.businessType,
      defaultWorkdayStartMinutes:
        validated.defaultWorkdayStartMinutes === undefined ? undefined : validated.defaultWorkdayStartMinutes,
      defaultWorkdayEndMinutes: validated.defaultWorkdayEndMinutes === undefined ? undefined : validated.defaultWorkdayEndMinutes,
      defaultDailyCapacityMinutes:
        validated.defaultDailyCapacityMinutes === undefined ? undefined : validated.defaultDailyCapacityMinutes,
      defaultJobDurationMinutes:
        validated.defaultJobDurationMinutes === undefined ? undefined : validated.defaultJobDurationMinutes,
      defaultTravelBufferMinutes:
        validated.defaultTravelBufferMinutes === undefined ? undefined : validated.defaultTravelBufferMinutes,
      travelBufferEnabled: validated.travelBufferEnabled ?? undefined,
      announcementsEnabled: validated.announcementsEnabled ?? undefined,
      urgentAnnouncementBehavior: validated.urgentAnnouncementBehavior ?? undefined,
      commFromName: validated.commFromName === undefined ? undefined : validated.commFromName,
      commFromEmail: validated.commFromEmail === undefined ? undefined : validated.commFromEmail,
      commReplyToEmail: validated.commReplyToEmail === undefined ? undefined : validated.commReplyToEmail,
      automationsDisabled: validated.automationsDisabled ?? undefined,
      xeroSyncPaymentsEnabled: validated.xeroSyncPaymentsEnabled ?? undefined,
      xeroSalesAccountCode: validated.xeroSalesAccountCode === undefined ? undefined : validated.xeroSalesAccountCode,
      xeroTaxType: validated.xeroTaxType === undefined ? undefined : validated.xeroTaxType,
      marginWarningPercent: validated.marginWarningPercent === undefined ? undefined : validated.marginWarningPercent,
      marginCriticalPercent: validated.marginCriticalPercent === undefined ? undefined : validated.marginCriticalPercent,
      varianceThresholdPercent: validated.varianceThresholdPercent === undefined ? undefined : validated.varianceThresholdPercent,
      qualityCallbackDays: validated.qualityCallbackDays === undefined ? undefined : validated.qualityCallbackDays,
      hqAddressLine1: validated.hqAddressLine1 === undefined ? undefined : validated.hqAddressLine1,
      hqAddressLine2: validated.hqAddressLine2 === undefined ? undefined : validated.hqAddressLine2,
      hqSuburb: validated.hqSuburb === undefined ? undefined : validated.hqSuburb,
      hqState: validated.hqState === undefined ? undefined : validated.hqState,
      hqPostcode: validated.hqPostcode === undefined ? undefined : validated.hqPostcode,
      updatedAt: new Date(),
    } as any;

    const [row] = await db
      .insert(orgSettings)
      .values({ ...values, createdAt: new Date(), updatedAt: new Date() } as any)
      .onConflictDoUpdate({
        target: orgSettings.orgId,
        set: { ...values, updatedAt: new Date() } as any,
      })
      .returning();

    if (!row) return err('INTERNAL_ERROR', 'Failed to update settings');
    return ok(row);
  } catch (error) {
    console.error('Error updating org settings:', error);
    return err('INTERNAL_ERROR', 'Failed to update settings', error);
  }
}

export async function updateOrgLogoPath(params: { orgId: string; companyLogoPath: string | null }): Promise<Result<OrgSettings>> {
  try {
    const db = getDb();
    const [row] = await db
      .update(orgSettings)
      .set({ companyLogoPath: params.companyLogoPath, updatedAt: new Date() } as any)
      .where(eq(orgSettings.orgId, params.orgId))
      .returning();

    if (row) return ok(row);

    const [inserted] = await db
      .insert(orgSettings)
      .values({ orgId: params.orgId, companyLogoPath: params.companyLogoPath, createdAt: new Date(), updatedAt: new Date() } as any)
      .returning();
    if (!inserted) return err('INTERNAL_ERROR', 'Failed to update logo');
    return ok(inserted);
  } catch (error) {
    console.error('Error updating org logo path:', error);
    return err('INTERNAL_ERROR', 'Failed to update logo', error);
  }
}
