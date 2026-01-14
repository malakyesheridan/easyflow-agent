'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Chip from '@/components/ui/Chip';
import Select from '@/components/ui/Select';
import { useOrgConfig } from '@/hooks/useOrgConfig';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type ListItemDraft = {
  id?: string;
  label: string;
  clientId: string;
};

type ZoneDraft = {
  id?: string;
  name: string;
  suburbs: string[];
  clientId: string;
  suburbInput: string;
};

const STEPS = [
  { id: 1, title: 'Agency setup', subtitle: 'Brand and identity' },
  { id: 2, title: 'Team profile', subtitle: 'Territory and cadence' },
  { id: 3, title: 'Buyer intake', subtitle: 'Lead sources and pipeline' },
  { id: 4, title: 'Listing pipeline', subtitle: 'Stages and status set' },
  { id: 5, title: 'Matching setup', subtitle: 'Config and zones' },
  { id: 6, title: 'Vendor reports', subtitle: 'Defaults and finish' },
];

const DEFAULT_LEAD_SOURCES = ['REA', 'Domain', 'Signboard', 'Referral', 'Instagram', 'Website'];
const DEFAULT_BUYER_PIPELINE = [
  'New enquiry',
  'Qualified',
  'Engaged',
  'Inspection booked',
  'Offer made',
  'Won',
  'Lost',
];
const DEFAULT_LISTING_PIPELINE = ['Appraisal', 'Listed', 'Active campaign', 'Under offer', 'Sold', 'Withdrawn'];
const DEFAULT_LISTING_STATUSES = ['Coming soon', 'Active', 'Under offer', 'Sold'];
const DEFAULT_COMMENTARY_TEMPLATE = 'Summarize buyer demand, inspection activity, and market movement for the past period.';

function getApiErrorMessage(payload: ApiResponse<any>): string | undefined {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
}

async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const json = (await res.json()) as ApiResponse<T>;
  const message = getApiErrorMessage(json);
  if (!res.ok || !json.ok) throw new Error(message || fallbackMessage);
  return json.data;
}

function makeId(prefix: string) {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildDraftList(values: string[], prefix: string): ListItemDraft[] {
  return values.map((label) => ({
    clientId: makeId(prefix),
    label,
  }));
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeListItems(items: ListItemDraft[], label: string) {
  const trimmed = items
    .map((item) => ({ id: item.id, name: item.label.trim() }))
    .filter((item) => item.name.length > 0);

  if (trimmed.length === 0) {
    return { error: `Add at least one ${label}.` };
  }

  const seen = new Set<string>();
  for (const item of trimmed) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) {
      return { error: `${label} must be unique.` };
    }
    seen.add(key);
  }

  return { items: trimmed };
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function OnboardingWizard() {
  const router = useRouter();
  const { config, loading, refresh, error: configError } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [step, setStep] = useState(1);
  const [loadingState, setLoadingState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);

  const [orgName, setOrgName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#111827');
  const [secondaryColor, setSecondaryColor] = useState('');

  const [officeType, setOfficeType] = useState('');
  const [timezone, setTimezone] = useState('');
  const [serviceAreaSuburbs, setServiceAreaSuburbs] = useState<string[]>([]);
  const [serviceAreaInput, setServiceAreaInput] = useState('');
  const [reportCadence, setReportCadence] = useState<'weekly' | 'fortnightly'>('weekly');

  const [buyerIntakePublicEnabled, setBuyerIntakePublicEnabled] = useState(false);
  const [buyerIntakeManualEnabled, setBuyerIntakeManualEnabled] = useState(true);
  const [leadSources, setLeadSources] = useState<ListItemDraft[]>([]);
  const [buyerPipelineStages, setBuyerPipelineStages] = useState<ListItemDraft[]>([]);

  const [listingPipelineStages, setListingPipelineStages] = useState<ListItemDraft[]>([]);
  const [listingStatusOptions, setListingStatusOptions] = useState<ListItemDraft[]>([]);

  const [matchingMode, setMatchingMode] = useState<'suburb' | 'zone'>('zone');
  const [budgetWeight, setBudgetWeight] = useState(25);
  const [locationWeight, setLocationWeight] = useState(25);
  const [propertyTypeWeight, setPropertyTypeWeight] = useState(20);
  const [bedsBathsWeight, setBedsBathsWeight] = useState(15);
  const [timeframeWeight, setTimeframeWeight] = useState(15);
  const [hotMatchThreshold, setHotMatchThreshold] = useState('85');
  const [goodMatchThreshold, setGoodMatchThreshold] = useState('70');
  const [zones, setZones] = useState<ZoneDraft[]>([]);

  const [includeDemandSummary, setIncludeDemandSummary] = useState(true);
  const [includeActivitySummary, setIncludeActivitySummary] = useState(true);
  const [includeMarketOverview, setIncludeMarketOverview] = useState(true);
  const [commentaryTemplate, setCommentaryTemplate] = useState(DEFAULT_COMMENTARY_TEMPLATE);
  const [createDemoData, setCreateDemoData] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const progressPercent = useMemo(() => {
    return Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  }, [step]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [step]);

  useEffect(() => {
    if (!loading && config?.onboardingCompleted) {
      router.replace('/dashboard');
    }
  }, [config?.onboardingCompleted, loading, router]);

  useEffect(() => {
    if (!loading && config?.onboardingStep) {
      setStep(config.onboardingStep);
    }
  }, [config?.onboardingStep, loading]);

  const loadInitial = useCallback(async () => {
    if (!orgId) {
      setLoadingState(false);
      return;
    }
    setLoadingState(true);
    setError(null);
    try {
      const [orgRes, settingsRes, leadSourcesRes, buyerStagesRes, listingStagesRes, matchingRes, zonesRes, reportRes] =
        await Promise.all([
          fetch(`/api/orgs?orgId=${orgId}`),
          fetch(`/api/settings?orgId=${orgId}`),
          fetch(`/api/lead-sources?orgId=${orgId}`),
          fetch(`/api/buyer-pipeline?orgId=${orgId}`),
          fetch(`/api/listing-pipeline?orgId=${orgId}`),
          fetch(`/api/matching-config?orgId=${orgId}`),
          fetch(`/api/suburb-zones?orgId=${orgId}`),
          fetch(`/api/report-templates?orgId=${orgId}&type=vendor`),
        ]);

      const orgJson = (await orgRes.json()) as ApiResponse<any>;
      const settingsJson = (await settingsRes.json()) as ApiResponse<any>;
      const leadSourcesJson = (await leadSourcesRes.json()) as ApiResponse<any[]>;
      const buyerStagesJson = (await buyerStagesRes.json()) as ApiResponse<any[]>;
      const listingStagesJson = (await listingStagesRes.json()) as ApiResponse<any[]>;
      const matchingJson = (await matchingRes.json()) as ApiResponse<any>;
      const zonesJson = (await zonesRes.json()) as ApiResponse<any[]>;
      const reportJson = (await reportRes.json()) as ApiResponse<any[]>;

      if (orgRes.ok && orgJson.ok) {
        setOrgName(String(orgJson.data?.name ?? ''));
        setPrimaryColor(String(orgJson.data?.brandPrimaryColor ?? '#111827'));
        setSecondaryColor(String(orgJson.data?.brandSecondaryColor ?? ''));
      }

      if (settingsRes.ok && settingsJson.ok) {
        setOfficeType(String(settingsJson.data?.officeType ?? ''));
        const resolvedTimezone = String(settingsJson.data?.timezone ?? '') || detectTimezone();
        setTimezone(resolvedTimezone);
        const cadence = String(settingsJson.data?.reportCadence ?? 'weekly');
        setReportCadence(cadence === 'fortnightly' ? 'fortnightly' : 'weekly');
        const suburbs = Array.isArray(settingsJson.data?.serviceAreaSuburbs)
          ? settingsJson.data.serviceAreaSuburbs.map((value: any) => String(value))
          : [];
        setServiceAreaSuburbs(normalizeStringList(suburbs));
        setBuyerIntakePublicEnabled(Boolean(settingsJson.data?.buyerIntakePublicEnabled ?? false));
        setBuyerIntakeManualEnabled(Boolean(settingsJson.data?.buyerIntakeManualEnabled ?? true));
        const statusOptions = Array.isArray(settingsJson.data?.listingStatusOptions)
          ? settingsJson.data.listingStatusOptions.map((value: any) => String(value))
          : [];
        setListingStatusOptions(
          buildDraftList(statusOptions.length > 0 ? statusOptions : DEFAULT_LISTING_STATUSES, 'status')
        );
      } else {
        setTimezone(detectTimezone());
        setListingStatusOptions(buildDraftList(DEFAULT_LISTING_STATUSES, 'status'));
      }

      const resolvedLogo =
        (orgRes.ok && orgJson.ok ? orgJson.data?.logoPath : null) ??
        (settingsRes.ok && settingsJson.ok ? settingsJson.data?.companyLogoPath : null);
      if (resolvedLogo !== undefined) setLogoPath(resolvedLogo ?? null);

      if (leadSourcesRes.ok && leadSourcesJson.ok && leadSourcesJson.data.length > 0) {
        setLeadSources(
          leadSourcesJson.data.map((row: any) => ({
            id: String(row.id),
            label: String(row.name ?? ''),
            clientId: String(row.id ?? makeId('lead')),
          }))
        );
      } else {
        setLeadSources(buildDraftList(DEFAULT_LEAD_SOURCES, 'lead'));
      }

      if (buyerStagesRes.ok && buyerStagesJson.ok && buyerStagesJson.data.length > 0) {
        setBuyerPipelineStages(
          buyerStagesJson.data.map((row: any) => ({
            id: String(row.id),
            label: String(row.name ?? ''),
            clientId: String(row.id ?? makeId('buyer-stage')),
          }))
        );
      } else {
        setBuyerPipelineStages(buildDraftList(DEFAULT_BUYER_PIPELINE, 'buyer-stage'));
      }

      if (listingStagesRes.ok && listingStagesJson.ok && listingStagesJson.data.length > 0) {
        setListingPipelineStages(
          listingStagesJson.data.map((row: any) => ({
            id: String(row.id),
            label: String(row.name ?? ''),
            clientId: String(row.id ?? makeId('listing-stage')),
          }))
        );
      } else {
        setListingPipelineStages(buildDraftList(DEFAULT_LISTING_PIPELINE, 'listing-stage'));
      }

      if (matchingRes.ok && matchingJson.ok && matchingJson.data) {
        setMatchingMode(matchingJson.data.mode === 'suburb' ? 'suburb' : 'zone');
        setBudgetWeight(Number(matchingJson.data.budgetWeight ?? 25));
        setLocationWeight(Number(matchingJson.data.locationWeight ?? 25));
        setPropertyTypeWeight(Number(matchingJson.data.propertyTypeWeight ?? 20));
        setBedsBathsWeight(Number(matchingJson.data.bedsBathsWeight ?? 15));
        setTimeframeWeight(Number(matchingJson.data.timeframeWeight ?? 15));
        setHotMatchThreshold(String(matchingJson.data.hotMatchThreshold ?? 85));
        setGoodMatchThreshold(String(matchingJson.data.goodMatchThreshold ?? 70));
      }

      if (zonesRes.ok && zonesJson.ok) {
        setZones(
          zonesJson.data.map((zone: any) => ({
            id: String(zone.id),
            name: String(zone.name ?? ''),
            suburbs: Array.isArray(zone.suburbs) ? zone.suburbs.map((value: any) => String(value)) : [],
            clientId: String(zone.id ?? makeId('zone')),
            suburbInput: '',
          }))
        );
      }

      if (reportRes.ok && reportJson.ok && reportJson.data.length > 0) {
        const template = reportJson.data[0];
        setIncludeDemandSummary(Boolean(template.includeDemandSummary ?? true));
        setIncludeActivitySummary(Boolean(template.includeActivitySummary ?? true));
        setIncludeMarketOverview(Boolean(template.includeMarketOverview ?? true));
        setCommentaryTemplate(String(template.commentaryTemplate ?? DEFAULT_COMMENTARY_TEMPLATE));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load onboarding data');
    } finally {
      setLoadingState(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!loading) {
      void loadInitial();
    }
  }, [loadInitial, loading]);

  const updateOnboardingStep = useCallback(
    async (nextStep: number) => {
      if (!orgId) return;
      await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, onboardingStep: nextStep }),
      });
    },
    [orgId]
  );

  const triggerLogoPicker = () => logoInputRef.current?.click();

  const handleLogoUpload = async (file: File | null) => {
    if (!file || !orgId) return;
    const fileType = file.type?.toLowerCase?.() ?? '';
    const isSupported =
      fileType === 'image/png' ||
      fileType === 'image/jpeg' ||
      fileType === 'image/jpg' ||
      /\.(png|jpe?g)$/i.test(file.name || '');
    if (!isSupported) {
      setLogoError('Only PNG or JPEG logos are supported.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    setLogoUploading(true);
    setLogoError(null);
    try {
      const form = new FormData();
      form.set('orgId', orgId);
      form.set('file', file);
      const res = await fetch('/api/settings/logo/upload', { method: 'POST', body: form });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to upload logo');
      setLogoPath(json.data.companyLogoPath ?? json.data.logoPath ?? null);
      setLogoSuccess('Logo uploaded');
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
      setTimeout(() => setLogoSuccess(null), 1500);
    }
  };

  const saveStep1 = async () => {
    if (!orgId) return;
    if (!orgName.trim()) {
      setError('Agency or office name is required.');
      return;
    }
    if (!primaryColor.trim()) {
      setError('Primary brand color is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await parseApiResponse(
        await fetch('/api/orgs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            name: orgName.trim(),
            brandPrimaryColor: primaryColor.trim(),
            brandSecondaryColor: secondaryColor.trim() || null,
          }),
        }),
        'Failed to save agency'
      );

      await parseApiResponse(
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, companyName: orgName.trim() }),
        }),
        'Failed to save agency settings'
      );

      setSuccess('Agency saved');
      await updateOnboardingStep(2);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save agency');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep2 = async () => {
    if (!orgId) return;
    if (!officeType.trim()) {
      setError('Select an office type.');
      return;
    }
    if (!timezone.trim()) {
      setError('Timezone is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const cleanedSuburbs = normalizeStringList(serviceAreaSuburbs);
      await parseApiResponse(
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            officeType: officeType.trim(),
            timezone: timezone.trim(),
            serviceAreaSuburbs: cleanedSuburbs,
            reportCadence,
          }),
        }),
        'Failed to save team profile'
      );

      setSuccess('Team profile saved');
      await updateOnboardingStep(3);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save team profile');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep3 = async () => {
    if (!orgId) return;
    const leadResult = normalizeListItems(leadSources, 'lead source');
    if (leadResult.error) {
      setError(leadResult.error);
      return;
    }
    const pipelineResult = normalizeListItems(buyerPipelineStages, 'buyer pipeline stage');
    if (pipelineResult.error) {
      setError(pipelineResult.error);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await parseApiResponse(
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            buyerIntakePublicEnabled,
            buyerIntakeManualEnabled,
          }),
        }),
        'Failed to save intake settings'
      );

      await parseApiResponse(
        await fetch('/api/lead-sources', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, sources: leadResult.items }),
        }),
        'Failed to save lead sources'
      );

      await parseApiResponse(
        await fetch('/api/buyer-pipeline', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, stages: pipelineResult.items }),
        }),
        'Failed to save buyer pipeline'
      );

      setSuccess('Buyer intake saved');
      await updateOnboardingStep(4);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save buyer intake');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep4 = async () => {
    if (!orgId) return;
    const listingStagesResult = normalizeListItems(listingPipelineStages, 'listing pipeline stage');
    if (listingStagesResult.error) {
      setError(listingStagesResult.error);
      return;
    }

    const statusOptions = normalizeStringList(listingStatusOptions.map((item) => item.label));
    if (statusOptions.length === 0) {
      setError('Add at least one listing status.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await parseApiResponse(
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            listingStatusOptions: statusOptions,
          }),
        }),
        'Failed to save listing settings'
      );

      await parseApiResponse(
        await fetch('/api/listing-pipeline', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, stages: listingStagesResult.items }),
        }),
        'Failed to save listing pipeline'
      );

      setSuccess('Listing pipeline saved');
      await updateOnboardingStep(5);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save listing pipeline');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep5 = async () => {
    if (!orgId) return;

    const hotValue = Number(hotMatchThreshold);
    const goodValue = Number(goodMatchThreshold);

    if (!Number.isFinite(hotValue) || !Number.isFinite(goodValue)) {
      setError('Match thresholds must be numbers.');
      return;
    }
    if (goodValue > hotValue) {
      setError('Good match threshold must be below hot match threshold.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await parseApiResponse(
        await fetch('/api/matching-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            mode: matchingMode,
            budgetWeight,
            locationWeight,
            propertyTypeWeight,
            bedsBathsWeight,
            timeframeWeight,
            hotMatchThreshold: hotValue,
            goodMatchThreshold: goodValue,
          }),
        }),
        'Failed to save matching config'
      );

      if (matchingMode === 'zone') {
        const zonePayload = zones.map((zone) => ({
          id: zone.id,
          name: zone.name.trim(),
          suburbs: normalizeStringList(zone.suburbs),
        }));
        await parseApiResponse(
          await fetch('/api/suburb-zones', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId, zones: zonePayload }),
          }),
          'Failed to save suburb zones'
        );
      }

      setSuccess('Matching setup saved');
      await updateOnboardingStep(6);
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save matching setup');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const completeOnboarding = async () => {
    await parseApiResponse(
      await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, onboardingCompleted: true, onboardingStep: STEPS.length }),
      }),
      'Failed to complete onboarding'
    );
    await refresh();
    router.replace('/dashboard');
  };

  const saveStep6 = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      await parseApiResponse(
        await fetch('/api/report-templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            templateType: 'vendor',
            name: 'Vendor report',
            includeDemandSummary,
            includeActivitySummary,
            includeMarketOverview,
            commentaryTemplate: commentaryTemplate.trim() || null,
          }),
        }),
        'Failed to save report template'
      );

      await parseApiResponse(
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, reportCadence }),
        }),
        'Failed to save report cadence'
      );

      if (createDemoData) {
        await parseApiResponse(
          await fetch('/api/demo/seed-real-estate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId }),
          }),
          'Failed to seed demo data'
        );
      }

      setSuccess('Setup complete');
      await completeOnboarding();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finish onboarding');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const addLeadSource = () => {
    setLeadSources((prev) => [...prev, { clientId: makeId('lead'), label: '' }]);
  };

  const updateLeadSource = (index: number, patch: Partial<ListItemDraft>) => {
    setLeadSources((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeLeadSource = (index: number) => {
    setLeadSources((prev) => prev.filter((_, i) => i !== index));
  };

  const addBuyerStage = () => {
    setBuyerPipelineStages((prev) => [...prev, { clientId: makeId('buyer-stage'), label: '' }]);
  };

  const updateBuyerStage = (index: number, patch: Partial<ListItemDraft>) => {
    setBuyerPipelineStages((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeBuyerStage = (index: number) => {
    setBuyerPipelineStages((prev) => prev.filter((_, i) => i !== index));
  };

  const addListingStage = () => {
    setListingPipelineStages((prev) => [...prev, { clientId: makeId('listing-stage'), label: '' }]);
  };

  const updateListingStage = (index: number, patch: Partial<ListItemDraft>) => {
    setListingPipelineStages((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeListingStage = (index: number) => {
    setListingPipelineStages((prev) => prev.filter((_, i) => i !== index));
  };

  const addListingStatus = () => {
    setListingStatusOptions((prev) => [...prev, { clientId: makeId('status'), label: '' }]);
  };

  const updateListingStatus = (index: number, patch: Partial<ListItemDraft>) => {
    setListingStatusOptions((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeListingStatus = (index: number) => {
    setListingStatusOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const addServiceAreaSuburb = () => {
    const next = normalizeStringList([...serviceAreaSuburbs, serviceAreaInput]);
    setServiceAreaSuburbs(next);
    setServiceAreaInput('');
  };

  const removeServiceAreaSuburb = (value: string) => {
    setServiceAreaSuburbs((prev) => prev.filter((item) => item.toLowerCase() !== value.toLowerCase()));
  };

  const addZone = () => {
    setZones((prev) => [...prev, { clientId: makeId('zone'), name: '', suburbs: [], suburbInput: '' }]);
  };

  const updateZone = (index: number, patch: Partial<ZoneDraft>) => {
    setZones((prev) => prev.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)));
  };

  const removeZone = (index: number) => {
    setZones((prev) => prev.filter((_, i) => i !== index));
  };

  const addZoneSuburb = (index: number) => {
    setZones((prev) =>
      prev.map((zone, i) => {
        if (i !== index) return zone;
        const suburbs = normalizeStringList([...zone.suburbs, zone.suburbInput]);
        return { ...zone, suburbs, suburbInput: '' };
      })
    );
  };

  const removeZoneSuburb = (index: number, suburb: string) => {
    setZones((prev) =>
      prev.map((zone, i) => {
        if (i !== index) return zone;
        return {
          ...zone,
          suburbs: zone.suburbs.filter((item) => item.toLowerCase() !== suburb.toLowerCase()),
        };
      })
    );
  };

  if (loading || loadingState) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading onboarding...</div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-sm text-text-secondary">
            {configError ? 'Unable to load organisation data.' : 'Organisation not found.'}
          </div>
          {configError && <div className="text-xs text-text-tertiary">{configError}</div>}
          <Button variant="secondary" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const stepMeta = STEPS[step - 1];
  const summaryBuyerStages = buyerPipelineStages.filter((row) => row.label.trim());
  const summaryListingStages = listingPipelineStages.filter((row) => row.label.trim());
  const summaryZones = zones.filter((zone) => zone.name.trim());

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-text-tertiary">Onboarding</p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Set up your agency workspace</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Capture the essentials for selling agent operations, then expand as you grow.
            </p>
          </div>
          <div className="text-sm text-text-secondary">Step {step} of {STEPS.length}</div>
        </div>

        <div className="mb-6">
          <div className="h-2 w-full rounded-full bg-bg-section/70 overflow-hidden">
            <div className="h-full bg-accent-gold transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="space-y-5 h-fit">
            <div>
              <p className="text-sm font-semibold text-text-primary">Setup progress</p>
              <p className="text-xs text-text-tertiary mt-1">{progressPercent}% complete</p>
            </div>
            <div className="space-y-4">
              {STEPS.map((s) => {
                const isActive = s.id === step;
                const isDone = s.id < step;
                return (
                  <div key={s.id} className="flex items-start gap-3">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Circle className={`h-5 w-5 ${isActive ? 'text-accent-gold' : 'text-text-tertiary'}`} />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {s.title}
                      </p>
                      <p className="text-xs text-text-tertiary">{s.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Step {step}</p>
              <h2 className="mt-2 text-2xl font-semibold text-text-primary">{stepMeta?.title}</h2>
              <p className="mt-1 text-sm text-text-secondary">{stepMeta?.subtitle}</p>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {success}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Agency or office name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Enter agency name"
                  />
                  <div className="space-y-3">
                    <div className="flex items-end gap-3">
                      <Input
                        label="Primary brand color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#111827"
                      />
                      <div
                        className="h-10 w-10 rounded-md border border-border-subtle"
                        style={{ backgroundColor: primaryColor || '#ffffff' }}
                      />
                    </div>
                    <div className="flex items-end gap-3">
                      <Input
                        label="Secondary color (optional)"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        placeholder="#f59e0b"
                      />
                      <div
                        className="h-10 w-10 rounded-md border border-border-subtle"
                        style={{ backgroundColor: secondaryColor || '#ffffff' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md border border-border-subtle bg-bg-section/30 overflow-hidden flex items-center justify-center">
                      {logoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoPath} alt={`${orgName || 'Agency'} logo`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-text-tertiary">Logo</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {orgName.trim() || 'Agency branding'}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {logoPath ? 'Logo uploaded' : 'Upload a logo (optional)'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={triggerLogoPicker} disabled={saving || logoUploading}>
                        {logoUploading ? 'Uploading...' : 'Upload logo'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={saveStep1}
                        disabled={saving || logoUploading}
                      >
                        Skip for now
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-text-tertiary">JPG/PNG only. Optional.</p>
                  </div>
                </div>

                {logoError && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    {logoError}
                  </div>
                )}
                {logoSuccess && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    {logoSuccess}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button onClick={saveStep1} disabled={saving || logoUploading}>
                    {saving ? 'Saving...' : 'Save and continue'}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Select label="Office type" value={officeType} onChange={(e) => setOfficeType(e.target.value)}>
                    <option value="">Select office type</option>
                    <option value="solo">Solo agent</option>
                    <option value="team">Team</option>
                    <option value="multi-agent">Multi-agent office</option>
                  </Select>
                  <Select
                    label="Default report cadence"
                    value={reportCadence}
                    onChange={(e) => setReportCadence(e.target.value as 'weekly' | 'fortnightly')}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Australia/Perth"
                  />
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Service area suburbs</p>
                    <p className="text-xs text-text-tertiary mt-1">Add the suburbs you commonly work in.</p>
                    <div className="mt-3 flex gap-2">
                      <Input
                        label="Add suburb"
                        value={serviceAreaInput}
                        onChange={(e) => setServiceAreaInput(e.target.value)}
                        placeholder="e.g. Paddington"
                      />
                      <Button variant="secondary" onClick={addServiceAreaSuburb}>
                        Add
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {serviceAreaSuburbs.map((suburb) => (
                        <Chip key={suburb} active onClick={() => removeServiceAreaSuburb(suburb)}>
                          {suburb}
                        </Chip>
                      ))}
                      {serviceAreaSuburbs.length === 0 && (
                        <span className="text-xs text-text-tertiary">No suburbs added yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(1)} disabled={saving}>
                    Back
                  </Button>
                  <Button onClick={saveStep2} disabled={saving}>
                    {saving ? 'Saving...' : 'Save and continue'}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Buyer intake options</p>
                    <p className="text-xs text-text-tertiary mt-1">Control how buyers enter the pipeline.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      active={buyerIntakePublicEnabled}
                      onClick={() => setBuyerIntakePublicEnabled(!buyerIntakePublicEnabled)}
                    >
                      Public intake form {buyerIntakePublicEnabled ? 'On' : 'Off'}
                    </Chip>
                    <Chip
                      active={buyerIntakeManualEnabled}
                      onClick={() => setBuyerIntakeManualEnabled(!buyerIntakeManualEnabled)}
                    >
                      Manual add {buyerIntakeManualEnabled ? 'On' : 'Off'}
                    </Chip>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-text-primary">Lead sources</p>
                    {leadSources.map((row, index) => (
                      <div key={row.clientId} className="flex items-center gap-2">
                        <Input
                          label={`Source ${index + 1}`}
                          value={row.label}
                          onChange={(e) => updateLeadSource(index, { label: e.target.value })}
                          placeholder="e.g. Referral"
                        />
                        {leadSources.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeLeadSource(index)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addLeadSource}>
                      Add source
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-text-primary">Buyer pipeline stages</p>
                    {buyerPipelineStages.map((row, index) => (
                      <div key={row.clientId} className="flex items-center gap-2">
                        <Input
                          label={`Stage ${index + 1}`}
                          value={row.label}
                          onChange={(e) => updateBuyerStage(index, { label: e.target.value })}
                          placeholder="e.g. Qualified"
                        />
                        {buyerPipelineStages.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeBuyerStage(index)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addBuyerStage}>
                      Add stage
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(2)} disabled={saving}>
                    Back
                  </Button>
                  <Button onClick={saveStep3} disabled={saving}>
                    {saving ? 'Saving...' : 'Save and continue'}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-text-primary">Listing pipeline stages</p>
                    {listingPipelineStages.map((row, index) => (
                      <div key={row.clientId} className="flex items-center gap-2">
                        <Input
                          label={`Stage ${index + 1}`}
                          value={row.label}
                          onChange={(e) => updateListingStage(index, { label: e.target.value })}
                          placeholder="e.g. Active campaign"
                        />
                        {listingPipelineStages.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeListingStage(index)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addListingStage}>
                      Add stage
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-text-primary">Listing status set</p>
                    {listingStatusOptions.map((row, index) => (
                      <div key={row.clientId} className="flex items-center gap-2">
                        <Input
                          label={`Status ${index + 1}`}
                          value={row.label}
                          onChange={(e) => updateListingStatus(index, { label: e.target.value })}
                          placeholder="e.g. Under offer"
                        />
                        {listingStatusOptions.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeListingStatus(index)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addListingStatus}>
                      Add status
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(3)} disabled={saving}>
                    Back
                  </Button>
                  <Button onClick={saveStep4} disabled={saving}>
                    {saving ? 'Saving...' : 'Save and continue'}
                  </Button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-3">
                  <p className="text-sm font-semibold text-text-primary">Matching mode</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={matchingMode === 'suburb'} onClick={() => setMatchingMode('suburb')}>
                      Suburb only
                    </Chip>
                    <Chip active={matchingMode === 'zone'} onClick={() => setMatchingMode('zone')}>
                      Zone based (recommended)
                    </Chip>
                  </div>
                </div>

                {matchingMode === 'zone' && (
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Starter zones (optional)</p>
                      <p className="text-xs text-text-tertiary mt-1">You can skip and configure zones later.</p>
                    </div>
                    {zones.length === 0 && (
                      <p className="text-xs text-text-tertiary">No zones added yet.</p>
                    )}
                    <div className="space-y-4">
                      {zones.map((zone, index) => (
                        <div key={zone.clientId} className="rounded-md border border-border-subtle bg-bg-section/40 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <Input
                              label="Zone name"
                              value={zone.name}
                              onChange={(e) => updateZone(index, { name: e.target.value })}
                              placeholder="e.g. Inner North"
                            />
                            {zones.length > 1 && (
                              <Button variant="ghost" size="sm" onClick={() => removeZone(index)}>
                                Remove
                              </Button>
                            )}
                          </div>
                          <div>
                            <div className="flex gap-2">
                              <Input
                                label="Add suburb"
                                value={zone.suburbInput}
                                onChange={(e) => updateZone(index, { suburbInput: e.target.value })}
                                placeholder="Add suburb"
                              />
                              <Button variant="secondary" size="sm" onClick={() => addZoneSuburb(index)}>
                                Add
                              </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {zone.suburbs.map((suburb) => (
                                <Chip key={`${zone.clientId}-${suburb}`} active onClick={() => removeZoneSuburb(index, suburb)}>
                                  {suburb}
                                </Chip>
                              ))}
                              {zone.suburbs.length === 0 && (
                                <span className="text-xs text-text-tertiary">No suburbs yet.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button variant="secondary" size="sm" onClick={addZone}>
                      Add zone
                    </Button>
                  </div>
                )}

                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                  <p className="text-sm font-semibold text-text-primary">Matching weights</p>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Budget</span>
                        <span>{budgetWeight}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={budgetWeight}
                        onChange={(e) => setBudgetWeight(Number(e.target.value))}
                        className="w-full accent-accent-gold"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Location</span>
                        <span>{locationWeight}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={locationWeight}
                        onChange={(e) => setLocationWeight(Number(e.target.value))}
                        className="w-full accent-accent-gold"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Property type</span>
                        <span>{propertyTypeWeight}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={propertyTypeWeight}
                        onChange={(e) => setPropertyTypeWeight(Number(e.target.value))}
                        className="w-full accent-accent-gold"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Beds/Baths</span>
                        <span>{bedsBathsWeight}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={bedsBathsWeight}
                        onChange={(e) => setBedsBathsWeight(Number(e.target.value))}
                        className="w-full accent-accent-gold"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm text-text-secondary">
                        <span>Timeframe</span>
                        <span>{timeframeWeight}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={timeframeWeight}
                        onChange={(e) => setTimeframeWeight(Number(e.target.value))}
                        className="w-full accent-accent-gold"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Hot match threshold"
                    inputMode="numeric"
                    value={hotMatchThreshold}
                    onChange={(e) => setHotMatchThreshold(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="85"
                  />
                  <Input
                    label="Good match threshold"
                    inputMode="numeric"
                    value={goodMatchThreshold}
                    onChange={(e) => setGoodMatchThreshold(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="70"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(4)} disabled={saving}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    {matchingMode === 'zone' && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setZones([]);
                          void saveStep5();
                        }}
                        disabled={saving}
                      >
                        Skip zones for now
                      </Button>
                    )}
                    <Button onClick={saveStep5} disabled={saving}>
                      {saving ? 'Saving...' : 'Save and continue'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Vendor report defaults</p>
                    <p className="text-xs text-text-tertiary mt-1">Set what should appear in every vendor report.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={includeDemandSummary} onClick={() => setIncludeDemandSummary(!includeDemandSummary)}>
                      Demand summary
                    </Chip>
                    <Chip active={includeActivitySummary} onClick={() => setIncludeActivitySummary(!includeActivitySummary)}>
                      Activity summary
                    </Chip>
                    <Chip active={includeMarketOverview} onClick={() => setIncludeMarketOverview(!includeMarketOverview)}>
                      Market overview
                    </Chip>
                  </div>
                  <Textarea
                    label="Commentary template"
                    value={commentaryTemplate}
                    onChange={(e) => setCommentaryTemplate(e.target.value)}
                    rows={3}
                  />
                  <Select
                    label="Default report cadence"
                    value={reportCadence}
                    onChange={(e) => setReportCadence(e.target.value as 'weekly' | 'fortnightly')}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                  </Select>
                </div>

                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-3">
                  <p className="text-sm font-semibold text-text-primary">Demo data (optional)</p>
                  <p className="text-xs text-text-tertiary">Add one buyer and one listing so you can test matching.</p>
                  <Chip active={createDemoData} onClick={() => setCreateDemoData(!createDemoData)}>
                    {createDemoData ? 'Demo data will be created' : 'Create demo data'}
                  </Chip>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Agency</p>
                    <p className="mt-2 text-sm text-text-secondary">{orgName.trim() || 'Unnamed agency'}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-text-tertiary">
                      <span>Primary: {primaryColor}</span>
                      <span>Secondary: {secondaryColor || 'None'}</span>
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Territory</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {officeType || 'Office type not set'} | {timezone || 'Timezone'}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {serviceAreaSuburbs.length} suburbs | {reportCadence} cadence
                    </p>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Buyer pipeline</p>
                    <p className="mt-2 text-sm text-text-secondary">{summaryBuyerStages.length} stages</p>
                    <div className="mt-2 space-y-1 text-xs text-text-tertiary">
                      {summaryBuyerStages.slice(0, 4).map((row) => (
                        <div key={row.clientId}>{row.label}</div>
                      ))}
                      {summaryBuyerStages.length > 4 && <div>+{summaryBuyerStages.length - 4} more</div>}
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Listing pipeline</p>
                    <p className="mt-2 text-sm text-text-secondary">{summaryListingStages.length} stages</p>
                    <div className="mt-2 space-y-1 text-xs text-text-tertiary">
                      {summaryListingStages.slice(0, 4).map((row) => (
                        <div key={row.clientId}>{row.label}</div>
                      ))}
                      {summaryListingStages.length > 4 && <div>+{summaryListingStages.length - 4} more</div>}
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 md:col-span-2">
                    <p className="text-sm font-semibold text-text-primary">Matching</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      Mode: {matchingMode === 'zone' ? 'Zone based' : 'Suburb only'} | Zones: {summaryZones.length}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      Hot {hotMatchThreshold} | Good {goodMatchThreshold}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(5)} disabled={saving}>
                    Back
                  </Button>
                  <Button onClick={saveStep6} disabled={saving}>
                    {saving ? 'Finishing...' : 'Finish setup'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
