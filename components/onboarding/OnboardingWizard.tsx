
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Chip from '@/components/ui/Chip';
import { useOrgConfig } from '@/hooks/useOrgConfig';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

function getApiErrorMessage(payload: ApiResponse<any>): string | undefined {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
}

type JobTypeDraft = {
  id?: string;
  label: string;
  defaultDurationMinutes: string;
  requirePhotos: boolean;
  requireMaterials: boolean;
  requireReports: boolean;
  templateId?: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    isRequired: boolean;
  }>;
};

type CrewDraft = {
  id?: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  skills: string;
  dailyCapacityMinutes: string;
};

type MaterialDraft = {
  id?: string;
  name: string;
  unit: string;
  startingStock: string;
  lowStockThreshold: string;
};

const STEPS = [
  { id: 1, title: 'Organisation setup', subtitle: 'Brand and identity' },
  { id: 2, title: 'Work structure', subtitle: 'Defaults and hours' },
  { id: 3, title: 'Job types & templates', subtitle: 'Configure how work runs' },
  { id: 4, title: 'Crew setup', subtitle: 'Add your team' },
  { id: 5, title: 'Materials', subtitle: 'Optional inventory setup' },
  { id: 6, title: 'Review & finish', subtitle: 'Confirm details' },
];

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

  const [orgName, setOrgName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#111827');
  const [secondaryColor, setSecondaryColor] = useState('');

  const [businessType, setBusinessType] = useState('');
  const [workdayStart, setWorkdayStart] = useState('06:00');
  const [workdayEnd, setWorkdayEnd] = useState('18:00');
  const [defaultJobDuration, setDefaultJobDuration] = useState('120');
  const [defaultTravelBuffer, setDefaultTravelBuffer] = useState('30');
  const [hqAddressLine1, setHqAddressLine1] = useState('');
  const [hqAddressLine2, setHqAddressLine2] = useState('');
  const [hqSuburb, setHqSuburb] = useState('');
  const [hqState, setHqState] = useState('');
  const [hqPostcode, setHqPostcode] = useState('');

  const [jobTypes, setJobTypes] = useState<JobTypeDraft[]>([]);
  const [crews, setCrews] = useState<CrewDraft[]>([]);
  const [materials, setMaterials] = useState<MaterialDraft[]>([]);
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
      const [orgRes, settingsRes, jobTypesRes, templatesRes, crewsRes, materialsRes] = await Promise.all([
        fetch(`/api/orgs?orgId=${orgId}`),
        fetch(`/api/settings?orgId=${orgId}`),
        fetch(`/api/job-types?orgId=${orgId}&includeArchived=false`),
        fetch(`/api/work-templates?orgId=${orgId}&includeSteps=true&includeArchived=false`),
        fetch(`/api/crews?orgId=${orgId}&activeOnly=false`),
        fetch(`/api/materials?orgId=${orgId}`),
      ]);

      const orgJson = (await orgRes.json()) as ApiResponse<any>;
      const settingsJson = (await settingsRes.json()) as ApiResponse<any>;

      if (orgRes.ok && orgJson.ok) {
        setOrgName(String(orgJson.data.name ?? ''));
        setPrimaryColor(String(orgJson.data.brandPrimaryColor ?? '#111827'));
        setSecondaryColor(String(orgJson.data.brandSecondaryColor ?? ''));
      }

      if (settingsRes.ok && settingsJson.ok) {
        setBusinessType(String(settingsJson.data?.businessType ?? ''));
        setWorkdayStart(minutesToTimeString(settingsJson.data?.defaultWorkdayStartMinutes ?? 6 * 60));
        setWorkdayEnd(minutesToTimeString(settingsJson.data?.defaultWorkdayEndMinutes ?? 18 * 60));
        setDefaultJobDuration(String(settingsJson.data?.defaultJobDurationMinutes ?? 120));
        setDefaultTravelBuffer(String(settingsJson.data?.defaultTravelBufferMinutes ?? 30));
        setHqAddressLine1(String(settingsJson.data?.hqAddressLine1 ?? ''));
        setHqAddressLine2(String(settingsJson.data?.hqAddressLine2 ?? ''));
        setHqSuburb(String(settingsJson.data?.hqSuburb ?? ''));
        setHqState(String(settingsJson.data?.hqState ?? ''));
        setHqPostcode(String(settingsJson.data?.hqPostcode ?? ''));
      }

      const resolvedLogo =
        (orgRes.ok && orgJson.ok ? orgJson.data?.logoPath : null) ??
        (settingsRes.ok && settingsJson.ok ? settingsJson.data?.companyLogoPath : null);
      if (resolvedLogo !== undefined) setLogoPath(resolvedLogo ?? null);

      const jobTypesJson = (await jobTypesRes.json()) as ApiResponse<any[]>;
      const templatesJson = (await templatesRes.json()) as ApiResponse<any[]>;
      if (jobTypesRes.ok && jobTypesJson.ok) {
        const templates = templatesRes.ok && templatesJson.ok ? templatesJson.data || [] : [];
        const templateByJobType = new Map<string, any>();
        templates.forEach((tpl: any) => {
          if (tpl.jobTypeId) templateByJobType.set(String(tpl.jobTypeId), tpl);
        });

        const nextJobTypes = jobTypesJson.data.map((row: any) => {
          const tpl = templateByJobType.get(String(row.id));
          const steps =
            tpl?.steps && Array.isArray(tpl.steps)
              ? tpl.steps.map((s: any) => ({
                  id: makeId('step'),
                  title: String(s.title ?? ''),
                  description: String(s.description ?? ''),
                  isRequired: Boolean(s.isRequired ?? true),
                }))
              : [];
          return {
            id: String(row.id),
            label: String(row.label ?? ''),
            defaultDurationMinutes: row.defaultDurationMinutes ? String(row.defaultDurationMinutes) : '',
            requirePhotos: Boolean(row.requirePhotos),
            requireMaterials: Boolean(row.requireMaterials),
            requireReports: Boolean(row.requireReports),
            templateId: tpl?.id ? String(tpl.id) : undefined,
            steps: steps.length > 0 ? steps : [{ id: makeId('step'), title: '', description: '', isRequired: true }],
          } as JobTypeDraft;
        });

        setJobTypes(
          nextJobTypes.length > 0
            ? nextJobTypes
            : [
                {
                  label: '',
                  defaultDurationMinutes: '',
                  requirePhotos: false,
                  requireMaterials: false,
                  requireReports: false,
                  steps: [{ id: makeId('step'), title: '', description: '', isRequired: true }],
                },
              ]
        );
      } else {
        setJobTypes([
          {
            label: '',
            defaultDurationMinutes: '',
            requirePhotos: false,
            requireMaterials: false,
            requireReports: false,
            steps: [{ id: makeId('step'), title: '', description: '', isRequired: true }],
          },
        ]);
      }

      const crewsJson = (await crewsRes.json()) as ApiResponse<any[]>;
      if (crewsRes.ok && crewsJson.ok) {
        const mapped = crewsJson.data.map((row: any) => ({
          id: String(row.id),
          firstName: String(row.firstName ?? ''),
          lastName: String(row.lastName ?? ''),
          role: String(row.role ?? ''),
          email: String(row.email ?? ''),
          phone: String(row.phone ?? ''),
          skills: String(row.skills ?? ''),
          dailyCapacityMinutes: String(row.dailyCapacityMinutes ?? ''),
        }));
        setCrews(
          mapped.length > 0
            ? mapped
            : [
                {
                  firstName: '',
                  lastName: '',
                  role: '',
                  email: '',
                  phone: '',
                  skills: '',
                  dailyCapacityMinutes: '',
                },
              ]
        );
      } else {
        setCrews([
          {
            firstName: '',
            lastName: '',
            role: '',
            email: '',
            phone: '',
            skills: '',
            dailyCapacityMinutes: '',
          },
        ]);
      }

      const materialsJson = (await materialsRes.json()) as ApiResponse<any[]>;
      if (materialsRes.ok && materialsJson.ok) {
        const mapped = materialsJson.data.map((row: any) => ({
          id: String(row.id),
          name: String(row.name ?? ''),
          unit: String(row.unit ?? ''),
          startingStock: '',
          lowStockThreshold: row.reorderThreshold ? String(row.reorderThreshold) : '',
        }));
        setMaterials(
          mapped.length > 0
            ? mapped
            : [
                {
                  name: '',
                  unit: '',
                  startingStock: '',
                  lowStockThreshold: '',
                },
              ]
        );
      } else {
        setMaterials([
          {
            name: '',
            unit: '',
            startingStock: '',
            lowStockThreshold: '',
          },
        ]);
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

  const handleLogoUpload = async (file: File | null) => {
    if (!file || !orgId) return;
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
    setLogoUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('orgId', orgId);
      form.set('file', file);
      const res = await fetch('/api/settings/logo/upload', { method: 'POST', body: form });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to upload logo');
      setLogoPath(json.data.companyLogoPath ?? json.data.logoPath ?? null);
      setSuccess('Logo uploaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep1 = async () => {
    if (!orgId) return;
    if (!orgName.trim()) {
      setError('Organisation name is required.');
      return;
    }
    if (!primaryColor.trim()) {
      setError('Primary brand color is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const orgRes = await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          name: orgName.trim(),
          brandPrimaryColor: primaryColor.trim(),
          brandSecondaryColor: secondaryColor.trim() || null,
        }),
      });
      const orgJson = (await orgRes.json()) as ApiResponse<any>;
      const orgMessage = getApiErrorMessage(orgJson);
      if (!orgRes.ok || !orgJson.ok) throw new Error(orgMessage || 'Failed to save organisation');

      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, companyName: orgName.trim() }),
      });

      setSuccess('Organisation saved');
      await updateOnboardingStep(2);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save organisation');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep2 = async () => {
    if (!orgId) return;
    const startMinutes = timeStringToMinutes(workdayStart);
    const endMinutes = timeStringToMinutes(workdayEnd);
    const jobDuration = defaultJobDuration.trim() ? Number(defaultJobDuration.trim()) : null;
    const travelBuffer = defaultTravelBuffer.trim() ? Number(defaultTravelBuffer.trim()) : null;

    if (startMinutes === null || endMinutes === null) {
      setError('Enter workday hours as HH:MM.');
      return;
    }
    if (jobDuration !== null && !Number.isFinite(jobDuration)) {
      setError('Default job duration must be a number.');
      return;
    }
    if (travelBuffer !== null && !Number.isFinite(travelBuffer)) {
      setError('Travel buffer must be a number.');
      return;
    }
    const hasAnyHqField =
      hqAddressLine1.trim() ||
      hqAddressLine2.trim() ||
      hqSuburb.trim() ||
      hqState.trim() ||
      hqPostcode.trim();
    if (hasAnyHqField) {
      if (!hqAddressLine1.trim() || !hqSuburb.trim() || !hqPostcode.trim()) {
        setError('HQ location needs address line 1, suburb, and postcode.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          businessType: businessType.trim() || null,
          defaultWorkdayStartMinutes: startMinutes,
          defaultWorkdayEndMinutes: endMinutes,
          defaultJobDurationMinutes: jobDuration,
          defaultTravelBufferMinutes: travelBuffer,
          hqAddressLine1: hqAddressLine1.trim() ? hqAddressLine1.trim() : null,
          hqAddressLine2: hqAddressLine2.trim() ? hqAddressLine2.trim() : null,
          hqSuburb: hqSuburb.trim() ? hqSuburb.trim() : null,
          hqState: hqState.trim() ? hqState.trim() : null,
          hqPostcode: hqPostcode.trim() ? hqPostcode.trim() : null,
        }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to save work structure');

      setSuccess('Work structure saved');
      await updateOnboardingStep(3);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save work structure');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep3 = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const activeRows = jobTypes.filter((row) => {
        const hasInput =
          row.label.trim() ||
          row.defaultDurationMinutes.trim() ||
          row.requirePhotos ||
          row.requireMaterials ||
          row.requireReports ||
          row.steps.some((s) => s.title.trim() || s.description.trim());
        return hasInput;
      });

      if (activeRows.length === 0) {
        setError('Add at least one job type.');
        setSaving(false);
        return;
      }

      const nextJobTypes: JobTypeDraft[] = [];

      for (const row of activeRows) {
        const label = row.label.trim();
        if (!label) throw new Error('Each job type needs a name.');

        const steps = row.steps
          .map((step) => ({
            id: step.id,
            title: step.title.trim(),
            description: step.description.trim(),
            isRequired: step.isRequired,
          }))
          .filter((step) => step.title.length > 0);

        if (steps.length === 0) throw new Error(`Add at least one work step for "${label}".`);

        const durationValue = row.defaultDurationMinutes.trim()
          ? Number(row.defaultDurationMinutes.trim())
          : null;
        if (durationValue !== null && !Number.isFinite(durationValue)) {
          throw new Error(`Default duration for "${label}" must be a number.`);
        }

        const jobTypeRes = await fetch('/api/job-types', {
          method: row.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            id: row.id,
            label,
            defaultDurationMinutes: durationValue,
            requirePhotos: row.requirePhotos,
            requireMaterials: row.requireMaterials,
            requireReports: row.requireReports,
            isDefault: true,
          }),
        });
        const jobTypeJson = (await jobTypeRes.json()) as ApiResponse<any>;
        const jobTypeMessage = getApiErrorMessage(jobTypeJson);
        if (!jobTypeRes.ok || !jobTypeJson.ok) {
          throw new Error(jobTypeMessage || 'Failed to save job type');
        }

        const jobTypeId = String(jobTypeJson.data.id);
        const stepsPayload = steps.map((step, index) => ({
          title: step.title,
          description: step.description || null,
          isRequired: step.isRequired,
          sortOrder: index,
        }));

        const templateRes = await fetch('/api/work-templates', {
          method: row.templateId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.templateId,
            orgId,
            jobTypeId,
            name: `${label} template`,
            description: null,
            isDefault: true,
            steps: stepsPayload,
          }),
        });
        const templateJson = (await templateRes.json()) as ApiResponse<any>;
        const templateMessage = getApiErrorMessage(templateJson);
        if (!templateRes.ok || !templateJson.ok) {
          throw new Error(templateMessage || 'Failed to save work template');
        }

        nextJobTypes.push({
          ...row,
          id: jobTypeId,
          templateId: String(templateJson.data.id),
          label,
          defaultDurationMinutes: durationValue === null ? '' : String(durationValue),
          steps: steps.map((step) => ({
            id: step.id || makeId('step'),
            title: step.title,
            description: step.description,
            isRequired: step.isRequired,
          })),
        });
      }

      setJobTypes(
        nextJobTypes.length > 0
          ? nextJobTypes
          : [
              {
                label: '',
                defaultDurationMinutes: '',
                requirePhotos: false,
                requireMaterials: false,
                requireReports: false,
                steps: [{ id: makeId('step'), title: '', description: '', isRequired: true }],
              },
            ]
      );

      setSuccess('Job types saved');
      await updateOnboardingStep(4);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save job types');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep4 = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const activeRows = crews.filter((row) => {
        const hasInput =
          row.firstName.trim() ||
          row.lastName.trim() ||
          row.role.trim() ||
          row.email.trim() ||
          row.phone.trim() ||
          row.skills.trim() ||
          row.dailyCapacityMinutes.trim();
        return hasInput;
      });

      if (activeRows.length === 0) {
        setError('Add at least one crew member.');
        setSaving(false);
        return;
      }

      const defaultStart = timeStringToMinutes(workdayStart) ?? 6 * 60;
      const defaultEnd = timeStringToMinutes(workdayEnd) ?? 18 * 60;
      const nextCrews: CrewDraft[] = [];

      for (const row of activeRows) {
        const firstName = row.firstName.trim();
        const lastName = row.lastName.trim();
        if (!firstName || !lastName) throw new Error('Crew members need both first and last name.');

        const capacityValue = row.dailyCapacityMinutes.trim()
          ? Number(row.dailyCapacityMinutes.trim())
          : 8 * 60;
        if (!Number.isFinite(capacityValue)) throw new Error(`Capacity for ${firstName} ${lastName} must be a number.`);

        const crewRes = await fetch('/api/crews', {
          method: row.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            id: row.id,
            firstName,
            lastName,
            role: row.role.trim() || 'staff',
            email: row.email.trim() || null,
            phone: row.phone.trim() || null,
            skills: row.skills.trim() || null,
            active: true,
            defaultStartMinutes: defaultStart,
            defaultEndMinutes: defaultEnd,
            dailyCapacityMinutes: capacityValue,
          }),
        });
        const crewJson = (await crewRes.json()) as ApiResponse<any>;
        const crewMessage = getApiErrorMessage(crewJson);
        if (!crewRes.ok || !crewJson.ok) {
          throw new Error(crewMessage || 'Failed to save crew member');
        }

        nextCrews.push({
          ...row,
          id: String(crewJson.data.id),
          firstName,
          lastName,
          role: row.role.trim(),
          email: row.email.trim(),
          phone: row.phone.trim(),
          skills: row.skills.trim(),
          dailyCapacityMinutes: String(capacityValue),
        });
      }

      setCrews(
        nextCrews.length > 0
          ? nextCrews
          : [
              {
                firstName: '',
                lastName: '',
                role: '',
                email: '',
                phone: '',
                skills: '',
                dailyCapacityMinutes: '',
              },
            ]
      );

      setSuccess('Crew saved');
      await updateOnboardingStep(5);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save crew');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const saveStep5 = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const activeRows = materials.filter((row) => {
        const hasInput =
          row.name.trim() || row.unit.trim() || row.startingStock.trim() || row.lowStockThreshold.trim();
        return hasInput;
      });

      if (activeRows.length === 0) {
        await updateOnboardingStep(6);
        setStep(6);
        return;
      }

      const nextMaterials: MaterialDraft[] = [];

      for (const row of activeRows) {
        const name = row.name.trim();
        const unit = row.unit.trim();
        if (!name || !unit) throw new Error('Materials need both a name and a unit.');

        const thresholdValue = row.lowStockThreshold.trim() ? Number(row.lowStockThreshold.trim()) : null;
        if (thresholdValue !== null && !Number.isFinite(thresholdValue)) {
          throw new Error(`Low stock threshold for ${name} must be a number.`);
        }

        const materialRes = await fetch('/api/materials', {
          method: row.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            id: row.id,
            name,
            unit,
            reorderThreshold: thresholdValue,
          }),
        });
        const materialJson = (await materialRes.json()) as ApiResponse<any>;
        const materialMessage = getApiErrorMessage(materialJson);
        if (!materialRes.ok || !materialJson.ok) {
          throw new Error(materialMessage || 'Failed to save material');
        }

        const materialId = String(materialJson.data.id);
        const startingStockValue = row.startingStock.trim() ? Number(row.startingStock.trim()) : null;
        if (startingStockValue !== null && !Number.isFinite(startingStockValue)) {
          throw new Error(`Starting stock for ${name} must be a number.`);
        }
        if (startingStockValue !== null && startingStockValue < 0) {
          throw new Error(`Starting stock for ${name} cannot be negative.`);
        }

        if (startingStockValue && startingStockValue > 0) {
          await fetch('/api/material-inventory-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orgId,
              materialId,
              eventType: 'stock_added',
              quantity: startingStockValue,
              reason: 'Initial stock',
            }),
          });
        }

        nextMaterials.push({
          ...row,
          id: materialId,
          name,
          unit,
          lowStockThreshold: thresholdValue === null ? '' : String(thresholdValue),
          startingStock: '',
        });
      }

      setMaterials(
        nextMaterials.length > 0
          ? nextMaterials
          : [
              {
                name: '',
                unit: '',
                startingStock: '',
                lowStockThreshold: '',
              },
            ]
      );

      setSuccess('Materials saved');
      await updateOnboardingStep(6);
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save materials');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const finishOnboarding = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, onboardingCompleted: true, onboardingStep: STEPS.length }),
      });
      const json = (await res.json()) as ApiResponse<any>;
      const message = getApiErrorMessage(json);
      if (!res.ok || !json.ok) throw new Error(message || 'Failed to complete onboarding');
      setSuccess('Setup complete');
      await refresh();
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete onboarding');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 1500);
    }
  };

  const addJobType = () => {
    setJobTypes((prev) => [
      ...prev,
      {
        label: '',
        defaultDurationMinutes: '',
        requirePhotos: false,
        requireMaterials: false,
        requireReports: false,
        steps: [{ id: makeId('step'), title: '', description: '', isRequired: true }],
      },
    ]);
  };

  const updateJobType = (index: number, patch: Partial<JobTypeDraft>) => {
    setJobTypes((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeJobType = (index: number) => {
    setJobTypes((prev) => prev.filter((_, i) => i !== index));
  };

  const addJobStep = (jobIndex: number) => {
    setJobTypes((prev) =>
      prev.map((row, i) =>
        i === jobIndex
          ? {
              ...row,
              steps: [...row.steps, { id: makeId('step'), title: '', description: '', isRequired: true }],
            }
          : row
      )
    );
  };

  const updateJobStep = (
    jobIndex: number,
    stepIndex: number,
    patch: Partial<JobTypeDraft['steps'][number]>
  ) => {
    setJobTypes((prev) =>
      prev.map((row, i) => {
        if (i !== jobIndex) return row;
        return {
          ...row,
          steps: row.steps.map((step, idx) => (idx === stepIndex ? { ...step, ...patch } : step)),
        };
      })
    );
  };

  const removeJobStep = (jobIndex: number, stepIndex: number) => {
    setJobTypes((prev) =>
      prev.map((row, i) => {
        if (i !== jobIndex) return row;
        return {
          ...row,
          steps: row.steps.filter((_, idx) => idx !== stepIndex),
        };
      })
    );
  };

  const addCrew = () => {
    setCrews((prev) => [
      ...prev,
      {
        firstName: '',
        lastName: '',
        role: '',
        email: '',
        phone: '',
        skills: '',
        dailyCapacityMinutes: '',
      },
    ]);
  };

  const updateCrew = (index: number, patch: Partial<CrewDraft>) => {
    setCrews((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeCrew = (index: number) => {
    setCrews((prev) => prev.filter((_, i) => i !== index));
  };

  const addMaterial = () => {
    setMaterials((prev) => [
      ...prev,
      {
        name: '',
        unit: '',
        startingStock: '',
        lowStockThreshold: '',
      },
    ]);
  };

  const updateMaterial = (index: number, patch: Partial<MaterialDraft>) => {
    setMaterials((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerLogoPicker = () => logoInputRef.current?.click();

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
  const summaryJobTypes = jobTypes.filter((row) => row.label.trim());
  const summaryCrews = crews.filter((row) => row.firstName.trim() || row.lastName.trim());
  const summaryMaterials = materials.filter((row) => row.name.trim());

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-text-tertiary">Onboarding</p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Set up your organisation</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Complete the steps below to tailor the workspace to your operations.
            </p>
          </div>
          <div className="text-sm text-text-secondary">Step {step} of {STEPS.length}</div>
        </div>

        <div className="mb-6">
          <div className="h-2 w-full rounded-full bg-bg-section/70 overflow-hidden">
            <div
              className="h-full bg-accent-gold transition-all"
              style={{ width: `${progressPercent}%` }}
            />
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
                const isDone = s.id < step;
                const isActive = s.id === step;
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
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {success}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Organisation name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Enter organisation name"
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
                        <img src={logoPath} alt={`${orgName || 'Organisation'} logo`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-text-tertiary">Logo</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {orgName.trim() || 'Organisation branding'}
                      </p>
                      <p className="text-xs text-text-tertiary">{logoPath ? 'Logo uploaded' : 'Upload a logo (optional)'}</p>
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
                    <Button variant="secondary" onClick={triggerLogoPicker} disabled={saving || logoUploading}>
                      {logoUploading ? 'Uploading...' : 'Upload logo'}
                    </Button>
                    <p className="mt-1 text-[11px] text-text-tertiary">JPG/PNG only.</p>
                  </div>
                </div>

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
                  <Input
                    label="Business type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="e.g. Residential services, commercial installs"
                  />
                  <Input
                    label="Default job duration (minutes)"
                    inputMode="numeric"
                    value={defaultJobDuration}
                    onChange={(e) => setDefaultJobDuration(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="120"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Input
                    label="Workday start"
                    type="time"
                    value={workdayStart}
                    onChange={(e) => setWorkdayStart(e.target.value)}
                  />
                  <Input
                    label="Workday end"
                    type="time"
                    value={workdayEnd}
                    onChange={(e) => setWorkdayEnd(e.target.value)}
                  />
                  <Input
                    label="Default travel buffer (minutes)"
                    inputMode="numeric"
                    value={defaultTravelBuffer}
                    onChange={(e) => setDefaultTravelBuffer(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="30"
                  />
                </div>

                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                  <p className="text-sm font-semibold text-text-primary">HQ location (optional)</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Used for travel-aware scheduling when crews start or finish at HQ.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div className="space-y-4">
                  {jobTypes.map((row, index) => (
                    <div key={row.id ?? `job-${index}`} className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 w-full">
                          <Input
                            label="Job type name"
                            value={row.label}
                            onChange={(e) => updateJobType(index, { label: e.target.value })}
                            placeholder="e.g. Install, Repair"
                          />
                          <Input
                            label="Default duration (minutes)"
                            inputMode="numeric"
                            value={row.defaultDurationMinutes}
                            onChange={(e) =>
                              updateJobType(index, { defaultDurationMinutes: e.target.value.replace(/[^\d]/g, '') })
                            }
                            placeholder="120"
                          />
                          <div>
                            <p className="text-sm font-medium text-text-secondary mb-2">Required fields</p>
                            <div className="flex flex-wrap gap-2">
                              <Chip active={row.requirePhotos} onClick={() => updateJobType(index, { requirePhotos: !row.requirePhotos })}>
                                Photos
                              </Chip>
                              <Chip active={row.requireMaterials} onClick={() => updateJobType(index, { requireMaterials: !row.requireMaterials })}>
                                Materials
                              </Chip>
                              <Chip active={row.requireReports} onClick={() => updateJobType(index, { requireReports: !row.requireReports })}>
                                Reports
                              </Chip>
                            </div>
                          </div>
                        </div>
                        {jobTypes.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeJobType(index)}>
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-medium text-text-secondary">Work steps</p>
                        {row.steps.map((stepRow, stepIndex) => (
                          <div key={stepRow.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-3 space-y-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <Input
                                label="Step title"
                                value={stepRow.title}
                                onChange={(e) => updateJobStep(index, stepIndex, { title: e.target.value })}
                                placeholder="Step name"
                              />
                              <div className="md:col-span-2">
                                <Textarea
                                  label="Description"
                                  value={stepRow.description}
                                  onChange={(e) => updateJobStep(index, stepIndex, { description: e.target.value })}
                                  placeholder="Optional details for this step"
                                  rows={2}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <Chip active={stepRow.isRequired} onClick={() => updateJobStep(index, stepIndex, { isRequired: !stepRow.isRequired })}>
                                {stepRow.isRequired ? 'Required' : 'Optional'}
                              </Chip>
                              {row.steps.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => removeJobStep(index, stepIndex)}>
                                  Remove step
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" onClick={() => addJobStep(index)}>
                          Add step
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(2)} disabled={saving}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={addJobType}>
                      Add job type
                    </Button>
                    <Button onClick={saveStep3} disabled={saving}>
                      {saving ? 'Saving...' : 'Save and continue'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  {crews.map((row, index) => (
                    <div key={row.id ?? `crew-${index}`} className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 w-full">
                          <Input
                            label="First name"
                            value={row.firstName}
                            onChange={(e) => updateCrew(index, { firstName: e.target.value })}
                          />
                          <Input
                            label="Last name"
                            value={row.lastName}
                            onChange={(e) => updateCrew(index, { lastName: e.target.value })}
                          />
                          <Input
                            label="Role"
                            value={row.role}
                            onChange={(e) => updateCrew(index, { role: e.target.value })}
                            placeholder="e.g. Lead installer"
                          />
                        </div>
                        {crews.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeCrew(index)}>
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          label="Email (optional)"
                          type="email"
                          value={row.email}
                          onChange={(e) => updateCrew(index, { email: e.target.value })}
                        />
                        <Input
                          label="Phone (optional)"
                          value={row.phone}
                          onChange={(e) => updateCrew(index, { phone: e.target.value })}
                        />
                        <Input
                          label="Skills or tags"
                          value={row.skills}
                          onChange={(e) => updateCrew(index, { skills: e.target.value })}
                          placeholder="e.g. crane, surveying"
                        />
                      </div>

                      <Input
                        label="Daily capacity (minutes)"
                        inputMode="numeric"
                        value={row.dailyCapacityMinutes}
                        onChange={(e) => updateCrew(index, { dailyCapacityMinutes: e.target.value.replace(/[^\d]/g, '') })}
                        placeholder="480"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(3)} disabled={saving}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={addCrew}>
                      Add crew member
                    </Button>
                    <Button onClick={saveStep4} disabled={saving}>
                      {saving ? 'Saving...' : 'Save and continue'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div className="rounded-md border border-border-subtle bg-bg-section/20 p-3 text-sm text-text-secondary">
                  Materials are optional right now. You can skip this step and add inventory later.
                </div>
                <div className="space-y-4">
                  {materials.map((row, index) => (
                    <div key={row.id ?? `mat-${index}`} className="rounded-md border border-border-subtle bg-bg-section/20 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 w-full">
                          <Input
                            label="Material name"
                            value={row.name}
                            onChange={(e) => updateMaterial(index, { name: e.target.value })}
                            placeholder="e.g. Sealant"
                          />
                          <Input
                            label="Unit"
                            value={row.unit}
                            onChange={(e) => updateMaterial(index, { unit: e.target.value })}
                            placeholder="e.g. units, m, kg"
                          />
                        </div>
                        {materials.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeMaterial(index)}>
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="Starting stock"
                          inputMode="numeric"
                          value={row.startingStock}
                          onChange={(e) => updateMaterial(index, { startingStock: e.target.value.replace(/[^\d.]/g, '') })}
                          placeholder="0"
                        />
                        <Input
                          label="Low-stock threshold"
                          inputMode="numeric"
                          value={row.lowStockThreshold}
                          onChange={(e) => updateMaterial(index, { lowStockThreshold: e.target.value.replace(/[^\d.]/g, '') })}
                          placeholder="10"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(4)} disabled={saving}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={addMaterial}>
                      Add material
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void updateOnboardingStep(6);
                        setStep(6);
                      }}
                      disabled={saving}
                    >
                      Skip for now
                    </Button>
                    <Button onClick={saveStep5} disabled={saving}>
                      {saving ? 'Saving...' : 'Save and continue'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Organisation</p>
                    <p className="mt-2 text-sm text-text-secondary">{orgName.trim() || 'Unnamed organisation'}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-text-tertiary">
                      <span>Primary: {primaryColor}</span>
                      <span>Secondary: {secondaryColor || 'None'}</span>
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Work structure</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {businessType.trim() || 'Business type not set'}
                    </p>
                    <p className="mt-2 text-xs text-text-tertiary">
                      Hours: {workdayStart} - {workdayEnd}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Default job duration: {defaultJobDuration || 'n/a'} mins | Travel buffer: {defaultTravelBuffer || 'n/a'} mins
                    </p>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Job types</p>
                    <p className="mt-2 text-sm text-text-secondary">{summaryJobTypes.length} configured</p>
                    <div className="mt-2 space-y-1 text-xs text-text-tertiary">
                      {summaryJobTypes.slice(0, 4).map((row) => (
                        <div key={row.id ?? row.label}>{row.label}</div>
                      ))}
                      {summaryJobTypes.length > 4 && <div>+{summaryJobTypes.length - 4} more</div>}
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4">
                    <p className="text-sm font-semibold text-text-primary">Crew</p>
                    <p className="mt-2 text-sm text-text-secondary">{summaryCrews.length} members</p>
                    <div className="mt-2 space-y-1 text-xs text-text-tertiary">
                      {summaryCrews.slice(0, 4).map((row) => (
                        <div key={row.id ?? `${row.firstName}-${row.lastName}`}>
                          {row.firstName} {row.lastName}
                        </div>
                      ))}
                      {summaryCrews.length > 4 && <div>+{summaryCrews.length - 4} more</div>}
                    </div>
                  </div>

                  <div className="rounded-md border border-border-subtle bg-bg-section/20 p-4 md:col-span-2">
                    <p className="text-sm font-semibold text-text-primary">Materials</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {summaryMaterials.length > 0 ? `${summaryMaterials.length} items` : 'No materials added yet'}
                    </p>
                    {summaryMaterials.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-tertiary">
                        {summaryMaterials.slice(0, 6).map((row) => (
                          <span key={row.id ?? row.name} className="rounded-full bg-bg-section px-2 py-1">
                            {row.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep(5)} disabled={saving}>
                    Back
                  </Button>
                  <Button onClick={finishOnboarding} disabled={saving}>
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

