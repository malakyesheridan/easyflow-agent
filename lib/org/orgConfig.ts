import type { OrgSettings } from '@/db/schema/org_settings';
import type { JobType } from '@/db/schema/job_types';
import type { OrgRole } from '@/db/schema/org_roles';
import type { Org } from '@/db/schema/orgs';

export type OrgVocabulary = {
  jobSingular: string;
  jobPlural: string;
  crewSingular: string;
  crewPlural: string;
  workStepSingular: string;
  workStepPlural: string;
  scheduleLabel: string;
  materialSingular: string;
  materialPlural: string;
  announcementSingular: string;
  announcementPlural: string;
  notificationSingular: string;
  notificationPlural: string;
};

export type OrgUnits = {
  materialDefaultUnit: string;
  weightUnit: string;
  areaUnit: string;
  distanceUnit: string;
  timeUnit: string;
};

export type OrgKpiUnits = {
  productivityUnit: string;
  throughputUnit: string;
};

export type OrgHqLocation = {
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
};

export type OrgConfig = {
  orgId: string;
  companyName: string | null;
  companyLogoPath: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  businessType: string | null;
  timezone: string | null;
  defaultWorkdayStartMinutes: number | null;
  defaultWorkdayEndMinutes: number | null;
  defaultDailyCapacityMinutes: number | null;
  defaultJobDurationMinutes: number | null;
  defaultTravelBufferMinutes: number | null;
  travelBufferEnabled: boolean;
  announcementsEnabled: boolean;
  urgentAnnouncementBehavior: string;
  marginWarningPercent: number;
  marginCriticalPercent: number;
  varianceThresholdPercent: number;
  qualityCallbackDays: number;
  hqLocation: OrgHqLocation;
  vocabulary: OrgVocabulary;
  units: OrgUnits;
  kpiUnits: OrgKpiUnits;
  jobTypes: JobType[];
  roles: OrgRole[];
  onboardingCompleted: boolean;
  onboardingStep: number;
};

export const defaultVocabulary: OrgVocabulary = {
  jobSingular: 'Job',
  jobPlural: 'Jobs',
  crewSingular: 'Crew member',
  crewPlural: 'Crew',
  workStepSingular: 'Work step',
  workStepPlural: 'Work steps',
  scheduleLabel: 'Schedule',
  materialSingular: 'Material',
  materialPlural: 'Materials',
  announcementSingular: 'Announcement',
  announcementPlural: 'Announcements',
  notificationSingular: 'Notification',
  notificationPlural: 'Notifications',
};

export const defaultUnits: OrgUnits = {
  materialDefaultUnit: 'units',
  weightUnit: 'kg',
  areaUnit: 'm2',
  distanceUnit: 'km',
  timeUnit: 'min',
};

export const defaultKpiUnits: OrgKpiUnits = {
  productivityUnit: 'm2/min',
  throughputUnit: 'm2/day',
};

const defaultHqLocation: OrgHqLocation = {
  addressLine1: null,
  addressLine2: null,
  suburb: null,
  state: null,
  postcode: null,
};

export const defaultMarginSettings = {
  marginWarningPercent: 30,
  marginCriticalPercent: 20,
  varianceThresholdPercent: 10,
};

function parseJson<T extends object>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...fallback, ...(parsed as Partial<T>) };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function buildOrgConfig(params: {
  orgId: string;
  org: Org | null;
  settings: OrgSettings | null;
  jobTypes: JobType[];
  roles: OrgRole[];
}): OrgConfig {
  const settings = params.settings;
  const org = params.org;
  return {
    orgId: params.orgId,
    companyName: org?.name ?? settings?.companyName ?? null,
    companyLogoPath: org?.logoPath ?? settings?.companyLogoPath ?? null,
    brandPrimaryColor: org?.brandPrimaryColor ?? null,
    brandSecondaryColor: org?.brandSecondaryColor ?? null,
    businessType: settings?.businessType ?? null,
    timezone: settings?.timezone ?? null,
    defaultWorkdayStartMinutes: settings?.defaultWorkdayStartMinutes ?? null,
    defaultWorkdayEndMinutes: settings?.defaultWorkdayEndMinutes ?? null,
    defaultDailyCapacityMinutes: settings?.defaultDailyCapacityMinutes ?? null,
    defaultJobDurationMinutes: settings?.defaultJobDurationMinutes ?? null,
    defaultTravelBufferMinutes: settings?.defaultTravelBufferMinutes ?? null,
    travelBufferEnabled: settings?.travelBufferEnabled ?? true,
    announcementsEnabled: settings?.announcementsEnabled ?? true,
    urgentAnnouncementBehavior: settings?.urgentAnnouncementBehavior ?? 'modal',
    marginWarningPercent: Number(settings?.marginWarningPercent ?? defaultMarginSettings.marginWarningPercent),
    marginCriticalPercent: Number(settings?.marginCriticalPercent ?? defaultMarginSettings.marginCriticalPercent),
    varianceThresholdPercent: Number(settings?.varianceThresholdPercent ?? defaultMarginSettings.varianceThresholdPercent),
    qualityCallbackDays: Number(settings?.qualityCallbackDays ?? 30),
    hqLocation: {
      addressLine1: settings?.hqAddressLine1 ?? null,
      addressLine2: settings?.hqAddressLine2 ?? null,
      suburb: settings?.hqSuburb ?? null,
      state: settings?.hqState ?? null,
      postcode: settings?.hqPostcode ?? null,
    },
    vocabulary: parseJson(settings?.vocabulary, defaultVocabulary),
    units: parseJson(settings?.units, defaultUnits),
    kpiUnits: parseJson(settings?.kpiUnits, defaultKpiUnits),
    jobTypes: params.jobTypes,
    roles: params.roles,
    onboardingCompleted: org?.onboardingCompleted ?? false,
    onboardingStep: org?.onboardingStep ?? 1,
  };
}
