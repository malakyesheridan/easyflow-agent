import { toNumber } from '@/lib/utils/quantity';
import type { CrewInstallStats } from '@/db/schema/crew_install_stats';
import type { InstallModifierWithJobState } from '@/lib/queries/install_modifiers';

export type CrewSpeedSnapshot = {
  windowDays: 7 | 30 | 90;
  m2PerMinute: number;
  totalM2: number;
  totalMinutes: number;
};

export type InstallEstimateBreakdown = {
  jobTotalM2: number;
  jobM2Source: 'planned' | 'used' | 'none';
  crewSpeed: CrewSpeedSnapshot | null;
  baseMinutes: number | null;
  multiplierTotal: number;
  adjustedMinutes: number | null;
  modifiers: Array<{
    id: string;
    name: string;
    description: string | null;
    multiplier: number;
    enabled: boolean;
    jobEnabled: boolean;
    applied: boolean;
  }>;
  notes: string[];
};

export function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  return unit
    .toLowerCase()
    .replace(/\u00b2/g, '2')
    .replace(/[^a-z0-9]/g, '');
}

export function isSquareMeterUnit(unit: string | null | undefined): boolean {
  const normalized = normalizeUnit(unit);
  if (!normalized) return false;
  return (
    normalized === 'm2' ||
    normalized === 'sqm' ||
    normalized === 'sqmeter' ||
    normalized === 'sqmeters' ||
    normalized === 'sqmetre' ||
    normalized === 'sqmetres' ||
    normalized === 'squaremeter' ||
    normalized === 'squaremeters' ||
    normalized === 'squaremetre' ||
    normalized === 'squaremetres'
  );
}

export function selectCrewSpeed(stats: CrewInstallStats | null): CrewSpeedSnapshot | null {
  if (!stats) return null;

  const windows: Array<{ windowDays: 30 | 90 | 7; m2: number; minutes: number; rate: number }> = [
    {
      windowDays: 30,
      m2: toNumber(stats.m2Total30d),
      minutes: Number(stats.minutesTotal30d ?? 0),
      rate: toNumber(stats.m2PerMinute30d),
    },
    {
      windowDays: 90,
      m2: toNumber(stats.m2Total90d),
      minutes: Number(stats.minutesTotal90d ?? 0),
      rate: toNumber(stats.m2PerMinute90d),
    },
    {
      windowDays: 7,
      m2: toNumber(stats.m2Total7d),
      minutes: Number(stats.minutesTotal7d ?? 0),
      rate: toNumber(stats.m2PerMinute7d),
    },
  ];

  const selected = windows.find((w) => w.rate > 0 && w.minutes > 0) ?? null;
  if (!selected) return null;

  return {
    windowDays: selected.windowDays,
    m2PerMinute: selected.rate,
    totalM2: selected.m2,
    totalMinutes: selected.minutes,
  };
}

export function computeInstallEstimate(params: {
  jobTotalM2: number;
  jobM2Source: 'planned' | 'used' | 'none';
  crewSpeed: CrewSpeedSnapshot | null;
  modifiers: InstallModifierWithJobState[];
}): InstallEstimateBreakdown {
  const notes: string[] = [];
  const jobTotalM2 = Number.isFinite(params.jobTotalM2) ? params.jobTotalM2 : 0;

  if (jobTotalM2 <= 0) {
    notes.push('Missing m2 quantity for job materials.');
  }
  if (!params.crewSpeed) {
    notes.push('Missing crew install speed for the selected employee.');
  }

  const baseMinutes =
    jobTotalM2 > 0 && params.crewSpeed && params.crewSpeed.m2PerMinute > 0
      ? jobTotalM2 / params.crewSpeed.m2PerMinute
      : null;

  const modifierBreakdown = params.modifiers.map((mod) => {
    const multiplier = toNumber(mod.multiplier);
    const applied = Boolean(mod.enabled && mod.jobEnabled && multiplier > 0);
    return {
      id: mod.id,
      name: mod.name,
      description: mod.description ?? null,
      multiplier,
      enabled: Boolean(mod.enabled),
      jobEnabled: Boolean(mod.jobEnabled),
      applied,
    };
  });

  const multiplierTotal = modifierBreakdown.reduce((acc, mod) => {
    if (!mod.applied) return acc;
    return acc * mod.multiplier;
  }, 1);

  const adjustedMinutes = baseMinutes !== null ? baseMinutes * multiplierTotal : null;

  return {
    jobTotalM2,
    jobM2Source: params.jobM2Source,
    crewSpeed: params.crewSpeed,
    baseMinutes,
    multiplierTotal,
    adjustedMinutes,
    modifiers: modifierBreakdown,
    notes,
  };
}
