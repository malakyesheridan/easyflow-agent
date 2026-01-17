export type AppEdition = 'real_estate' | 'trades';

function normalizeEdition(value: string | undefined | null): AppEdition {
  const lowered = String(value || '').trim().toLowerCase();
  return lowered === 'trades' ? 'trades' : 'real_estate';
}

export function getAppEdition(): AppEdition {
  const envValue = process.env.NEXT_PUBLIC_APP_EDITION ?? process.env.APP_EDITION ?? 'real_estate';
  return normalizeEdition(envValue);
}

export function isRealEstateEdition(): boolean {
  return getAppEdition() === 'real_estate';
}

export function isTradeEdition(): boolean {
  return getAppEdition() === 'trades';
}
