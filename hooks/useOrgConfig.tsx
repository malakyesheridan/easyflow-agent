'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OrgConfig } from '@/lib/org/orgConfig';
import { defaultKpiUnits, defaultUnits, defaultVocabulary } from '@/lib/org/orgConfig';

type OrgConfigState = {
  config: OrgConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const OrgConfigContext = createContext<OrgConfigState | null>(null);

function buildFallbackConfig(): OrgConfig {
  return {
    orgId: '',
    companyName: null,
    companyLogoPath: null,
    brandPrimaryColor: null,
    brandSecondaryColor: null,
    businessType: null,
    timezone: null,
    defaultWorkdayStartMinutes: null,
    defaultWorkdayEndMinutes: null,
    defaultDailyCapacityMinutes: null,
    defaultJobDurationMinutes: null,
    defaultTravelBufferMinutes: null,
    travelBufferEnabled: true,
    announcementsEnabled: true,
    urgentAnnouncementBehavior: 'modal',
    marginWarningPercent: 30,
    marginCriticalPercent: 20,
    varianceThresholdPercent: 10,
    qualityCallbackDays: 30,
    hqLocation: {
      addressLine1: null,
      addressLine2: null,
      suburb: null,
      state: null,
      postcode: null,
    },
    vocabulary: defaultVocabulary,
    units: defaultUnits,
    kpiUnits: defaultKpiUnits,
    jobTypes: [],
    roles: [],
    onboardingCompleted: false,
    onboardingStep: 1,
  };
}

export function OrgConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<OrgConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/org-config');
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message || 'Failed to load org config');
        setConfig(buildFallbackConfig());
        return;
      }
      setConfig(json.data as OrgConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load org config');
      setConfig(buildFallbackConfig());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OrgConfigState>(
    () => ({ config, loading, error, refresh }),
    [config, loading, error, refresh]
  );

  return <OrgConfigContext.Provider value={value}>{children}</OrgConfigContext.Provider>;
}

export function useOrgConfig(): OrgConfigState {
  const context = useContext(OrgConfigContext);
  if (!context) {
    throw new Error('useOrgConfig must be used within OrgConfigProvider');
  }
  return context;
}
