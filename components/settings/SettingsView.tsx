'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Chip from '@/components/ui/Chip';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import OrgUserManagement from '@/components/settings/OrgUserManagement';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

const getApiErrorMessage = (payload: ApiResponse<any>): string | undefined => {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
};

type OrgSettingsRow = {
  orgId: string;
  companyName: string | null;
  companyLogoPath: string | null;
  timezone: string | null;
  defaultWorkdayStartMinutes: number | null;
  defaultWorkdayEndMinutes: number | null;
  defaultDailyCapacityMinutes: number | null;
  travelBufferEnabled: boolean;
  announcementsEnabled: boolean;
  urgentAnnouncementBehavior: 'modal' | 'banner' | string;
  xeroSyncPaymentsEnabled?: boolean | null;
  xeroSalesAccountCode?: string | null;
  xeroTaxType?: string | null;
  marginWarningPercent: number | null;
  marginCriticalPercent: number | null;
  varianceThresholdPercent: number | null;
  qualityCallbackDays: number | null;
  hqAddressLine1: string | null;
  hqAddressLine2: string | null;
  hqSuburb: string | null;
  hqState: string | null;
  hqPostcode: string | null;
  createdAt: string;
  updatedAt: string;
};

type InstallModifierRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  multiplier: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type SessionPayload = {
  actor?: { capabilities?: string[] } | null;
};

function minutesToTimeString(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStringToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function canManageDemo(payload: SessionPayload | null): boolean {
  const capabilities = payload?.actor?.capabilities ?? [];
  return capabilities.includes('admin') || capabilities.includes('manage_org');
}

function canViewAuditLogs(payload: SessionPayload | null): boolean {
  const capabilities = payload?.actor?.capabilities ?? [];
  return capabilities.includes('admin') || capabilities.includes('manage_org');
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <div className="h-4 w-40 rounded bg-bg-section/80" />
          <div className="mt-4 h-10 w-full rounded bg-bg-section/80" />
          <div className="mt-3 h-10 w-full rounded bg-bg-section/80" />
        </Card>
      ))}
    </div>
  );
}

export default function SettingsView({ orgId, appVersion }: { orgId: string; appVersion?: string }) {
  const [row, setRow] = useState<OrgSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [canLoadDemo, setCanLoadDemo] = useState(false);
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const demoSwipe = useSwipeToClose(() => {
    if (!demoLoading) setDemoModalOpen(false);
  }, isMobile);
  const [demoSuccess, setDemoSuccess] = useState<string | null>(null);
  const [clientSeedLoading, setClientSeedLoading] = useState(false);
  const [clientSeedError, setClientSeedError] = useState<string | null>(null);
  const [clientSeedSuccess, setClientSeedSuccess] = useState<string | null>(null);

  const [modifiers, setModifiers] = useState<InstallModifierRow[]>([]);
  const [modifiersLoading, setModifiersLoading] = useState(true);
  const [modifiersError, setModifiersError] = useState<string | null>(null);
  const [modifiersSaving, setModifiersSaving] = useState(false);
  const [newModifier, setNewModifier] = useState({
    name: '',
    description: '',
    multiplier: '1',
    enabled: true,
  });

  const [companyName, setCompanyName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [workdayStart, setWorkdayStart] = useState('');
  const [workdayEnd, setWorkdayEnd] = useState('');
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState('');
  const [travelBufferEnabled, setTravelBufferEnabled] = useState(true);
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(true);
  const [urgentBehavior, setUrgentBehavior] = useState<'modal' | 'banner'>('modal');
  const [marginWarning, setMarginWarning] = useState('');
  const [marginCritical, setMarginCritical] = useState('');
  const [varianceThreshold, setVarianceThreshold] = useState('');
  const [qualityCallbackDays, setQualityCallbackDays] = useState('');
  const [hqAddressLine1, setHqAddressLine1] = useState('');
  const [hqAddressLine2, setHqAddressLine2] = useState('');
  const [hqSuburb, setHqSuburb] = useState('');
  const [hqState, setHqState] = useState('');
  const [hqPostcode, setHqPostcode] = useState('');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('');
  const [brandSecondaryColor, setBrandSecondaryColor] = useState('');
  const [brandingSnapshot, setBrandingSnapshot] = useState({ primary: '', secondary: '' });
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null);
  const [productivitySeedLoading, setProductivitySeedLoading] = useState(false);
  const [productivitySeedError, setProductivitySeedError] = useState<string | null>(null);
  const [productivitySeedSuccess, setProductivitySeedSuccess] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<OrgSettingsRow | null>;
      if (!res.ok || !json.ok) throw new Error('Failed to load settings');

      const data = json.data;
      setRow(data);

      setCompanyName(data?.companyName ?? '');
      setTimezone(data?.timezone ?? '');
      setWorkdayStart(minutesToTimeString(data?.defaultWorkdayStartMinutes ?? null));
      setWorkdayEnd(minutesToTimeString(data?.defaultWorkdayEndMinutes ?? null));
      setDailyCapacityMinutes(
        data?.defaultDailyCapacityMinutes === null || data?.defaultDailyCapacityMinutes === undefined
          ? ''
          : String(data.defaultDailyCapacityMinutes)
      );
      setTravelBufferEnabled(data?.travelBufferEnabled ?? true);
      setAnnouncementsEnabled(data?.announcementsEnabled ?? true);
      setUrgentBehavior((data?.urgentAnnouncementBehavior as any) === 'banner' ? 'banner' : 'modal');
      setMarginWarning(
        data?.marginWarningPercent === null || data?.marginWarningPercent === undefined
          ? '30'
          : String(data.marginWarningPercent)
      );
      setMarginCritical(
        data?.marginCriticalPercent === null || data?.marginCriticalPercent === undefined
          ? '20'
          : String(data.marginCriticalPercent)
      );
      setVarianceThreshold(
        data?.varianceThresholdPercent === null || data?.varianceThresholdPercent === undefined
          ? '10'
          : String(data.varianceThresholdPercent)
      );
      setQualityCallbackDays(
        data?.qualityCallbackDays === null || data?.qualityCallbackDays === undefined
          ? '30'
          : String(data.qualityCallbackDays)
      );
      setHqAddressLine1(data?.hqAddressLine1 ?? '');
      setHqAddressLine2(data?.hqAddressLine2 ?? '');
      setHqSuburb(data?.hqSuburb ?? '');
      setHqState(data?.hqState ?? '');
      setHqPostcode(data?.hqPostcode ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
      setRow({
        orgId,
        companyName: null,
        companyLogoPath: null,
        timezone: null,
        defaultWorkdayStartMinutes: null,
        defaultWorkdayEndMinutes: null,
        defaultDailyCapacityMinutes: null,
        travelBufferEnabled: true,
        announcementsEnabled: true,
        urgentAnnouncementBehavior: 'modal',
        marginWarningPercent: 30,
        marginCriticalPercent: 20,
        varianceThresholdPercent: 10,
        qualityCallbackDays: 30,
        hqAddressLine1: null,
        hqAddressLine2: null,
        hqSuburb: null,
        hqState: null,
        hqPostcode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadBranding = useCallback(async () => {
    setBrandingLoading(true);
    setBrandingError(null);
    try {
      const res = await fetch(`/api/orgs?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<any>;
      if (!res.ok || !json.ok) {
        const message = getApiErrorMessage(json) || 'Failed to load branding';
        throw new Error(message);
      }
      const primary = json.data?.brandPrimaryColor ? String(json.data.brandPrimaryColor) : '';
      const secondary = json.data?.brandSecondaryColor ? String(json.data.brandSecondaryColor) : '';
      setBrandPrimaryColor(primary);
      setBrandSecondaryColor(secondary);
      setBrandingSnapshot({ primary, secondary });
    } catch (e) {
      setBrandingError(e instanceof Error ? e.message : 'Failed to load branding');
      setBrandPrimaryColor('');
      setBrandSecondaryColor('');
      setBrandingSnapshot({ primary: '', secondary: '' });
    } finally {
      setBrandingLoading(false);
    }
  }, [orgId]);

  const loadModifiers = useCallback(async () => {
    setModifiersLoading(true);
    setModifiersError(null);
    try {
      const res = await fetch(`/api/install-modifiers?orgId=${orgId}`);
      const json = (await res.json()) as ApiResponse<any[]>;
      if (!res.ok || !json.ok) throw new Error('Failed to load modifiers');

      const rows = (json.data || []).map((row: any) => ({
        id: String(row.id),
        orgId: String(row.orgId),
        name: String(row.name ?? ''),
        description: row.description ?? null,
        multiplier: String(row.multiplier ?? ''),
        enabled: Boolean(row.enabled),
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
      }));

      setModifiers(rows);
    } catch (e) {
      setModifiersError(e instanceof Error ? e.message : 'Failed to load modifiers');
      setModifiers([]);
    } finally {
      setModifiersLoading(false);
    }
  }, [orgId]);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/auth/session');
      const json = (await res.json()) as ApiResponse<SessionPayload>;
      if (!res.ok || !json.ok) {
        setCanLoadDemo(false);
        setCanViewAudit(false);
        return;
      }
      setCanLoadDemo(canManageDemo(json.data));
      setCanViewAudit(canViewAuditLogs(json.data));
    } catch {
      setCanLoadDemo(false);
      setCanViewAudit(false);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBranding();
  }, [loadBranding]);

  useEffect(() => {
    void loadModifiers();
  }, [loadModifiers]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const logoPath = row?.companyLogoPath ?? null;
  const brandLabel = companyName.trim() || 'Organisation';
  const brandingDirty = useMemo(() => {
    return (
      brandPrimaryColor.trim() !== brandingSnapshot.primary ||
      brandSecondaryColor.trim() !== brandingSnapshot.secondary
    );
  }, [brandPrimaryColor, brandSecondaryColor, brandingSnapshot.primary, brandingSnapshot.secondary]);
  const previewPrimaryColor = brandPrimaryColor.trim() || '#111827';
  const previewSecondaryColor = brandSecondaryColor.trim() || '#f59e0b';

  const isDirty = useMemo(() => {
    if (!row) return true;
    const nextMarginWarning = marginWarning.trim() ? Number(marginWarning.trim()) : null;
    const nextMarginCritical = marginCritical.trim() ? Number(marginCritical.trim()) : null;
    const nextVarianceThreshold = varianceThreshold.trim() ? Number(varianceThreshold.trim()) : null;
    const nextQualityCallbackDays = qualityCallbackDays.trim() ? Number(qualityCallbackDays.trim()) : 30;
    const next = {
      companyName: companyName.trim() || null,
      timezone: timezone.trim() || null,
      defaultWorkdayStartMinutes: timeStringToMinutes(workdayStart),
      defaultWorkdayEndMinutes: timeStringToMinutes(workdayEnd),
      defaultDailyCapacityMinutes: dailyCapacityMinutes.trim() ? Number(dailyCapacityMinutes.trim()) : null,
      travelBufferEnabled,
      announcementsEnabled,
      urgentAnnouncementBehavior: urgentBehavior,
      marginWarningPercent: Number.isFinite(nextMarginWarning as any) ? nextMarginWarning : null,
      marginCriticalPercent: Number.isFinite(nextMarginCritical as any) ? nextMarginCritical : null,
      varianceThresholdPercent: Number.isFinite(nextVarianceThreshold as any) ? nextVarianceThreshold : null,
      qualityCallbackDays: Number.isFinite(nextQualityCallbackDays as any) ? nextQualityCallbackDays : 30,
      hqAddressLine1: hqAddressLine1.trim() || null,
      hqAddressLine2: hqAddressLine2.trim() || null,
      hqSuburb: hqSuburb.trim() || null,
      hqState: hqState.trim() || null,
      hqPostcode: hqPostcode.trim() || null,
    };
    return (
      next.companyName !== row.companyName ||
      next.timezone !== row.timezone ||
      next.defaultWorkdayStartMinutes !== row.defaultWorkdayStartMinutes ||
      next.defaultWorkdayEndMinutes !== row.defaultWorkdayEndMinutes ||
      (Number.isFinite(next.defaultDailyCapacityMinutes as any)
        ? next.defaultDailyCapacityMinutes
        : null) !== row.defaultDailyCapacityMinutes ||
      next.travelBufferEnabled !== row.travelBufferEnabled ||
      next.announcementsEnabled !== row.announcementsEnabled ||
      next.urgentAnnouncementBehavior !== (row.urgentAnnouncementBehavior === 'banner' ? 'banner' : 'modal') ||
      next.marginWarningPercent !== row.marginWarningPercent ||
      next.marginCriticalPercent !== row.marginCriticalPercent ||
      next.varianceThresholdPercent !== row.varianceThresholdPercent ||
      next.qualityCallbackDays !== (row.qualityCallbackDays ?? 30) ||
      next.hqAddressLine1 !== row.hqAddressLine1 ||
      next.hqAddressLine2 !== row.hqAddressLine2 ||
      next.hqSuburb !== row.hqSuburb ||
      next.hqState !== row.hqState ||
      next.hqPostcode !== row.hqPostcode
    );
  }, [
    announcementsEnabled,
    companyName,
    dailyCapacityMinutes,
    hqAddressLine1,
    hqAddressLine2,
    hqPostcode,
    hqState,
    hqSuburb,
    marginCritical,
    marginWarning,
    qualityCallbackDays,
    row,
    timezone,
    travelBufferEnabled,
    urgentBehavior,
    varianceThreshold,
    workdayEnd,
    workdayStart,
  ]);

  const saveBranding = useCallback(async () => {
    if (!brandingDirty) return;
    setBrandingSaving(true);
    setBrandingError(null);
    setBrandingSuccess(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          brandPrimaryColor: brandPrimaryColor.trim() ? brandPrimaryColor.trim() : null,
          brandSecondaryColor: brandSecondaryColor.trim() ? brandSecondaryColor.trim() : null,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to save branding');
      const primary = json.data?.brandPrimaryColor ? String(json.data.brandPrimaryColor) : '';
      const secondary = json.data?.brandSecondaryColor ? String(json.data.brandSecondaryColor) : '';
      setBrandPrimaryColor(primary);
      setBrandSecondaryColor(secondary);
      setBrandingSnapshot({ primary, secondary });
      setBrandingSuccess('Branding saved');
      setTimeout(() => setBrandingSuccess(null), 2000);
    } catch (e) {
      setBrandingError(e instanceof Error ? e.message : 'Failed to save branding');
    } finally {
      setBrandingSaving(false);
    }
  }, [brandPrimaryColor, brandSecondaryColor, brandingDirty, orgId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        orgId,
        companyName: companyName.trim() ? companyName.trim() : null,
        timezone: timezone.trim() ? timezone.trim() : null,
        defaultWorkdayStartMinutes: timeStringToMinutes(workdayStart),
        defaultWorkdayEndMinutes: timeStringToMinutes(workdayEnd),
        defaultDailyCapacityMinutes: dailyCapacityMinutes.trim() ? Number(dailyCapacityMinutes.trim()) : null,
        travelBufferEnabled,
        announcementsEnabled,
        urgentAnnouncementBehavior: urgentBehavior,
        marginWarningPercent: marginWarning.trim() ? Number(marginWarning.trim()) : null,
        marginCriticalPercent: marginCritical.trim() ? Number(marginCritical.trim()) : null,
        varianceThresholdPercent: varianceThreshold.trim() ? Number(varianceThreshold.trim()) : null,
        qualityCallbackDays: qualityCallbackDays.trim() ? Number(qualityCallbackDays.trim()) : 30,
        hqAddressLine1: hqAddressLine1.trim() ? hqAddressLine1.trim() : null,
        hqAddressLine2: hqAddressLine2.trim() ? hqAddressLine2.trim() : null,
        hqSuburb: hqSuburb.trim() ? hqSuburb.trim() : null,
        hqState: hqState.trim() ? hqState.trim() : null,
        hqPostcode: hqPostcode.trim() ? hqPostcode.trim() : null,
      };

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<OrgSettingsRow>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to save settings');
      setRow(json.data);
      setSuccess('Saved');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [
    announcementsEnabled,
    companyName,
    dailyCapacityMinutes,
    hqAddressLine1,
    hqAddressLine2,
    hqPostcode,
    hqState,
    hqSuburb,
    marginCritical,
    marginWarning,
    orgId,
    qualityCallbackDays,
    timezone,
    travelBufferEnabled,
    urgentBehavior,
    varianceThreshold,
    workdayEnd,
    workdayStart,
  ]);

  const updateModifierRow = (index: number, patch: Partial<InstallModifierRow>) => {
    setModifiers((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const saveModifier = useCallback(
    async (index: number) => {
      const row = modifiers[index];
      if (!row) return;

      const multiplier = Number(row.multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        setModifiersError('Multiplier must be a positive number.');
        return;
      }
      if (!row.name.trim()) {
        setModifiersError('Modifier name is required.');
        return;
      }

      setModifiersSaving(true);
      setModifiersError(null);
      try {
        const res = await fetch('/api/install-modifiers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.id,
            orgId,
            name: row.name.trim(),
            description: row.description?.trim() || null,
            multiplier,
            enabled: row.enabled,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to update modifier');

      setModifiers((prev) =>
          prev.map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  name: String(json.data.name ?? ''),
                  description: json.data.description ?? null,
                  multiplier: String(json.data.multiplier ?? ''),
                  enabled: Boolean(json.data.enabled),
                  updatedAt: String(json.data.updatedAt ?? m.updatedAt),
                }
              : m
          )
        );
      } catch (e) {
        setModifiersError(e instanceof Error ? e.message : 'Failed to update modifier');
      } finally {
        setModifiersSaving(false);
      }
    },
    [modifiers, orgId]
  );

  const addModifier = useCallback(async () => {
    if (!newModifier.name.trim()) {
      setModifiersError('Modifier name is required.');
      return;
    }
    const multiplier = Number(newModifier.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      setModifiersError('Multiplier must be a positive number.');
      return;
    }

    setModifiersSaving(true);
    setModifiersError(null);
    try {
      const res = await fetch('/api/install-modifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          name: newModifier.name.trim(),
          description: newModifier.description.trim() || null,
          multiplier,
          enabled: newModifier.enabled,
      }),
    });
    const json = (await res.json()) as ApiResponse<any>;
    const message = getApiErrorMessage(json);
    if (!res.ok || !json.ok) throw new Error(message || 'Failed to add modifier');

    setNewModifier({ name: '', description: '', multiplier: '1', enabled: true });
      await loadModifiers();
    } catch (e) {
      setModifiersError(e instanceof Error ? e.message : 'Failed to add modifier');
    } finally {
      setModifiersSaving(false);
    }
  }, [loadModifiers, newModifier.description, newModifier.enabled, newModifier.multiplier, newModifier.name, orgId]);

  const seedProductivity = useCallback(async () => {
    setProductivitySeedLoading(true);
    setProductivitySeedError(null);
    setProductivitySeedSuccess(null);
    try {
      const res = await fetch('/api/install-productivity/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<{
        crewCount: number;
        jobCount: number;
        timeEntriesCreated: number;
        jobsUpdated: number;
      }>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to seed productivity data');
      setProductivitySeedSuccess(
        `Seeded ${json.data.timeEntriesCreated} time entries across ${json.data.jobCount} jobs for ${json.data.crewCount} crew members.`
      );
    } catch (e) {
      setProductivitySeedError(e instanceof Error ? e.message : 'Failed to seed productivity data');
    } finally {
      setProductivitySeedLoading(false);
    }
  }, [orgId]);

  const loadDemoDataset = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    setDemoSuccess(null);
    try {
      const res = await fetch('/api/demo/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to load demo dataset');
      const summary = json.data
        ? `Demo dataset loaded: ${json.data.jobs} jobs, ${json.data.crews} crews, ${json.data.materials} materials.`
        : 'Demo dataset loaded.';
      setDemoSuccess(summary);
      setDemoModalOpen(false);
      setTimeout(() => setDemoSuccess(null), 4000);
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Failed to load demo dataset');
    } finally {
      setDemoLoading(false);
    }
  }, [orgId]);

  const seedClientDataset = useCallback(async () => {
    setClientSeedLoading(true);
    setClientSeedError(null);
    setClientSeedSuccess(null);
    try {
      const res = await fetch('/api/demo/seed-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as ApiResponse<{
        clients: number;
        jobs: number;
        invoices: number;
        payments: number;
      }>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to seed demo clients');
      const summary = json.data
        ? `Seeded ${json.data.clients} clients, ${json.data.jobs} jobs, ${json.data.invoices} invoices, ${json.data.payments} payments.`
        : 'Demo clients seeded.';
      setClientSeedSuccess(summary);
      setTimeout(() => setClientSeedSuccess(null), 4000);
    } catch (e) {
      setClientSeedError(e instanceof Error ? e.message : 'Failed to seed demo clients');
    } finally {
      setClientSeedLoading(false);
    }
  }, [orgId]);

  const triggerLogoPicker = () => logoInputRef.current?.click();

  const onLogoSelected = async (file: File | null) => {
    if (!file) return;
    const fileType = file.type?.toLowerCase?.() ?? '';
    const isSupported =
      fileType === 'image/png' ||
      fileType === 'image/jpeg' ||
      fileType === 'image/jpg' ||
      /\.(png|jpe?g)$/i.test(file.name || '');
    if (!isSupported) {
      setError('Only PNG or JPEG logos are supported.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    setUploadingLogo(true);
    setError(null);
    try {
    const form = new FormData();
    form.set('orgId', orgId);
    form.set('file', file);
    const res = await fetch('/api/settings/logo/upload', { method: 'POST', body: form });
    const json = (await res.json()) as ApiResponse<OrgSettingsRow>;
    const message = getApiErrorMessage(json);
    if (!res.ok || !json.ok) throw new Error(message || 'Failed to upload logo');
    setRow(json.data);
    setSuccess('Logo updated');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const showProductivitySeed = false;

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-text-secondary">
          <div>
            {success ? (
              <span className="text-emerald-400">{success}</span>
            ) : isDirty ? (
              'Unsaved changes'
            ) : (
              'Up to date'
            )}
          </div>
          {appVersion && <div className="text-xs text-text-tertiary">App version {appVersion}</div>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={saving || uploadingLogo}>
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || uploadingLogo || !isDirty}>
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
      />

      <CollapsibleSection
        title="Organisation"
        description="Branding and org defaults."
        storageKey="settings.section.organisation"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter company name" />
          <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Australia/Sydney" />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-md border border-border-subtle bg-bg-section/30 overflow-hidden flex items-center justify-center">
              {logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPath} alt={`${brandLabel} logo`} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-text-tertiary">Logo</span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{brandLabel}</p>
              <p className="text-xs text-text-tertiary">{logoPath ? 'Logo uploaded' : 'No logo uploaded'}</p>
            </div>
          </div>

          <div className="sm:ml-auto">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={triggerLogoPicker} disabled={uploadingLogo || saving}>
                {uploadingLogo ? 'Uploading...' : 'Upload logo'}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-text-tertiary">JPG/PNG only.</p>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Invoice branding"
        description="Logo and colors shown on invoices and previews."
        storageKey="settings.section.invoice-branding"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void loadBranding()} disabled={brandingLoading || brandingSaving}>
              Refresh
            </Button>
            <Button onClick={() => void saveBranding()} disabled={brandingLoading || brandingSaving || !brandingDirty}>
              {brandingSaving ? 'Saving...' : 'Save branding'}
            </Button>
          </div>
        }
      >
        {brandingError && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {brandingError}
          </div>
        )}

        {brandingLoading ? (
          <p className="text-sm text-text-secondary">Loading branding...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
            <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md border border-border-subtle bg-bg-section/30 overflow-hidden flex items-center justify-center">
                  {logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPath} alt={`${brandLabel} logo`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-text-tertiary">Logo</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Invoice logo</p>
                  <p className="text-xs text-text-tertiary">Used on invoices and PDFs.</p>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={triggerLogoPicker} disabled={uploadingLogo || brandingSaving}>
                    {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-text-tertiary">JPG/PNG only.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Primary accent</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={previewPrimaryColor}
                    onChange={(e) => setBrandPrimaryColor(e.target.value)}
                    className="h-11 w-16 rounded-md border border-border-subtle bg-bg-input"
                    disabled={brandingSaving}
                  />
                  <input
                    type="text"
                    value={brandPrimaryColor}
                    onChange={(e) => setBrandPrimaryColor(e.target.value)}
                    placeholder="#111827"
                    className="w-full px-3 py-2 bg-bg-input border border-border-subtle rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-gold focus:border-transparent transition-all"
                    disabled={brandingSaving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Secondary accent</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={previewSecondaryColor}
                    onChange={(e) => setBrandSecondaryColor(e.target.value)}
                    className="h-11 w-16 rounded-md border border-border-subtle bg-bg-input"
                    disabled={brandingSaving}
                  />
                  <input
                    type="text"
                    value={brandSecondaryColor}
                    onChange={(e) => setBrandSecondaryColor(e.target.value)}
                    placeholder="#f59e0b"
                    className="w-full px-3 py-2 bg-bg-input border border-border-subtle rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-gold focus:border-transparent transition-all"
                    disabled={brandingSaving}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {brandingSuccess && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            {brandingSuccess}
          </div>
        )}
      </CollapsibleSection>

      <OrgUserManagement orgId={orgId} />

      {canLoadDemo && (
        <CollapsibleSection
          title="Demo &amp; testing"
          description="Load demo data for walkthroughs and sales demos."
          storageKey="settings.section.demo"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setDemoError(null);
                setDemoModalOpen(true);
              }}
              disabled={demoLoading || sessionLoading}
            >
              Load Demo Dataset
            </Button>
          }
        >
          {demoSuccess && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              {demoSuccess}
            </div>
          )}
          {demoError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {demoError}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={seedClientDataset}
                disabled={clientSeedLoading || demoLoading || sessionLoading}
              >
                {clientSeedLoading ? 'Seeding...' : 'Seed clients + client jobs'}
              </Button>
              <span className="text-xs text-text-tertiary">
                Creates demo clients with jobs, invoices, and payments to populate client metrics.
              </span>
            </div>
            {clientSeedSuccess && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {clientSeedSuccess}
              </div>
            )}
            {clientSeedError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {clientSeedError}
              </div>
            )}
          </div>

          <p className="text-sm text-text-secondary">
            Demo data is clearly marked and never overwrites production records.
          </p>
        </CollapsibleSection>
      )}

      {canViewAudit && (
        <CollapsibleSection
          title="Audit logs"
          description="Trace every change across jobs, schedules, and materials."
          storageKey="settings.section.audit"
          actions={
            <Link href={`/settings/audit-logs?orgId=${orgId}`}>
              <Button variant="secondary" disabled={sessionLoading}>
                View audit logs
              </Button>
            </Link>
          }
        >
          <p className="text-sm text-text-secondary">
            Review every change across schedules, materials, and job actions.
          </p>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Scheduling"
        description="Defaults used across the app (safe fallbacks apply)."
        storageKey="settings.section.scheduling"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Default day start"
            type="time"
            value={workdayStart}
            onChange={(e) => setWorkdayStart(e.target.value)}
            placeholder="06:00"
          />
          <Input
            label="Default day end"
            type="time"
            value={workdayEnd}
            onChange={(e) => setWorkdayEnd(e.target.value)}
            placeholder="18:00"
          />
          <Input
            label="Default daily capacity (minutes)"
            inputMode="numeric"
            value={dailyCapacityMinutes}
            onChange={(e) => setDailyCapacityMinutes(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="480"
          />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Travel buffer rules</p>
            <p className="text-xs text-text-tertiary mt-1">Controls whether travel buffers are shown/enforced.</p>
          </div>
          <div className="flex items-center gap-2">
            <Chip active={travelBufferEnabled} onClick={() => setTravelBufferEnabled(true)}>
              On
            </Chip>
            <Chip active={!travelBufferEnabled} onClick={() => setTravelBufferEnabled(false)}>
              Off
            </Chip>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="HQ location"
        description="Used for travel-aware scheduling when crews start or finish at HQ."
        storageKey="settings.section.hq"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Address line 1"
            value={hqAddressLine1}
            onChange={(e) => setHqAddressLine1(e.target.value)}
            placeholder="123 Example St"
          />
          <Input
            label="Address line 2"
            value={hqAddressLine2}
            onChange={(e) => setHqAddressLine2(e.target.value)}
            placeholder="Unit, suite, etc. (optional)"
          />
          <Input
            label="Suburb"
            value={hqSuburb}
            onChange={(e) => setHqSuburb(e.target.value)}
            placeholder="e.g. Fremantle"
          />
          <Input
            label="State"
            value={hqState}
            onChange={(e) => setHqState(e.target.value)}
            placeholder="e.g. WA"
          />
          <Input
            label="Postcode"
            value={hqPostcode}
            onChange={(e) => setHqPostcode(e.target.value)}
            placeholder="e.g. 6160"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Profitability guardrails"
        description="Alert thresholds for margin health and cost variance."
        storageKey="settings.section.profitability"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Warning margin (%)"
            inputMode="decimal"
            value={marginWarning}
            onChange={(e) => setMarginWarning(e.target.value)}
            placeholder="30"
          />
          <Input
            label="Critical margin (%)"
            inputMode="decimal"
            value={marginCritical}
            onChange={(e) => setMarginCritical(e.target.value)}
            placeholder="20"
          />
          <Input
            label="Cost variance trigger (%)"
            inputMode="decimal"
            value={varianceThreshold}
            onChange={(e) => setVarianceThreshold(e.target.value)}
            placeholder="10"
          />
        </div>
      </CollapsibleSection>

      {showProductivitySeed && (
        <CollapsibleSection
          title="Install productivity v2"
          description="Bucketed person-minute metrics and QA-adjusted output tracking are now always on."
          storageKey="settings.section.productivity"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Status</p>
              <p className="mt-2 text-sm text-text-secondary">Enabled by default</p>
              <p className="mt-2 text-xs text-text-tertiary">
                This is the default model going forward.
              </p>
            </div>
            <Input
              label="Callback quality window (days)"
              inputMode="numeric"
              value={qualityCallbackDays}
              onChange={(e) => setQualityCallbackDays(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="30"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={seedProductivity}
                disabled={productivitySeedLoading}
              >
                {productivitySeedLoading ? 'Seeding...' : 'Seed productivity data'}
              </Button>
              <span className="text-xs text-text-tertiary">
                Generates bucketed time entries and output fields for existing jobs without data.
              </span>
            </div>
            {productivitySeedSuccess && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {productivitySeedSuccess}
              </div>
            )}
            {productivitySeedError && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {productivitySeedError}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Notifications"
        description="Announcement delivery behaviour."
        storageKey="settings.section.notifications"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">Announcements</p>
            <div className="flex items-center gap-2">
              <Chip active={announcementsEnabled} onClick={() => setAnnouncementsEnabled(true)}>
                Enabled
              </Chip>
              <Chip active={!announcementsEnabled} onClick={() => setAnnouncementsEnabled(false)}>
                Disabled
              </Chip>
            </div>
            <p className="text-xs text-text-tertiary mt-2">If disabled, announcements are hidden for this org.</p>
          </div>

          <Select label="Urgent behaviour" value={urgentBehavior} onChange={(e) => setUrgentBehavior(e.target.value as any)}>
            <option value="modal">Blocking modal (requires acknowledgement)</option>
            <option value="banner">Banner (non-blocking)</option>
          </Select>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Install time modifiers"
        description="Editable multipliers used in install time estimates."
        storageKey="settings.section.install-modifiers"
        actions={
          <Button variant="secondary" onClick={loadModifiers} disabled={modifiersLoading || modifiersSaving}>
            Refresh
          </Button>
        }
      >
        {modifiersError && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {modifiersError}
          </div>
        )}

        {modifiersLoading ? (
          <p className="text-sm text-text-secondary">Loading modifiers...</p>
        ) : (
          <div className="space-y-4">
            {modifiers.length === 0 ? (
              <p className="text-sm text-text-secondary">No modifiers yet. Add one below.</p>
            ) : (
              <div className="space-y-3">
                {modifiers.map((row, index) => (
                  <div key={row.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_2fr_auto] md:items-center">
                      <Input
                        value={row.name}
                        onChange={(e) => updateModifierRow(index, { name: e.target.value })}
                        placeholder="Modifier name"
                      />
                      <Input
                        value={row.multiplier}
                        onChange={(e) => updateModifierRow(index, { multiplier: e.target.value })}
                        placeholder="Multiplier"
                        inputMode="decimal"
                      />
                      <Input
                        value={row.description ?? ''}
                        onChange={(e) => updateModifierRow(index, { description: e.target.value })}
                        placeholder="Description"
                      />
                      <div className="flex items-center gap-2">
                        <Chip active={row.enabled} onClick={() => updateModifierRow(index, { enabled: !row.enabled })}>
                          {row.enabled ? 'Enabled' : 'Disabled'}
                        </Chip>
                        <Button
                          variant="secondary"
                          onClick={() => void saveModifier(index)}
                          disabled={modifiersSaving}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
              <p className="text-sm font-medium text-text-primary mb-3">Add new modifier</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_2fr_auto] md:items-center">
                <Input
                  value={newModifier.name}
                  onChange={(e) => setNewModifier((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Modifier name"
                />
                <Input
                  value={newModifier.multiplier}
                  onChange={(e) => setNewModifier((prev) => ({ ...prev, multiplier: e.target.value }))}
                  placeholder="Multiplier"
                  inputMode="decimal"
                />
                <Input
                  value={newModifier.description}
                  onChange={(e) => setNewModifier((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Description"
                />
                <div className="flex items-center gap-2">
                  <Chip active={newModifier.enabled} onClick={() => setNewModifier((prev) => ({ ...prev, enabled: !prev.enabled }))}>
                    {newModifier.enabled ? 'Enabled' : 'Disabled'}
                  </Chip>
                  <Button variant="primary" onClick={() => void addModifier()} disabled={modifiersSaving}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {demoModalOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (!demoLoading) setDemoModalOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-8">
            <Card
              className={cn(
                'w-full bg-bg-base border border-border-subtle',
                isMobile ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto' : 'rounded-lg max-w-lg'
              )}
              {...demoSwipe}
            >
              <div className="p-4 md:p-6 space-y-4">
                {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">Load demo dataset</h3>
                    <p className="text-xs text-text-tertiary mt-1">Great for walkthroughs and QA.</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDemoModalOpen(false)}
                    disabled={demoLoading}
                  >
                    Close
                  </Button>
                </div>

                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                  This will create demo jobs, crews, materials, and schedules. It will NOT delete existing data.
                </div>

                {demoError && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    {demoError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDemoModalOpen(false)} disabled={demoLoading}>
                    Cancel
                  </Button>
                  <Button onClick={loadDemoDataset} disabled={demoLoading}>
                    {demoLoading ? 'Loading...' : 'Load Demo Dataset'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
