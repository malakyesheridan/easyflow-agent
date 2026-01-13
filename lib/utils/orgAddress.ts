export type HqAddressFields = {
  hqAddressLine1?: string | null;
  hqAddressLine2?: string | null;
  hqSuburb?: string | null;
  hqState?: string | null;
  hqPostcode?: string | null;
};

export function hasHqAddress(fields: HqAddressFields): boolean {
  return Boolean(fields.hqAddressLine1?.trim() && fields.hqSuburb?.trim() && fields.hqPostcode?.trim());
}

export function buildHqAddress(fields: HqAddressFields): string {
  const parts: string[] = [];

  if (fields.hqAddressLine1?.trim()) {
    parts.push(fields.hqAddressLine1.trim());
  }
  if (fields.hqAddressLine2?.trim()) {
    parts.push(fields.hqAddressLine2.trim());
  }

  const locationParts: string[] = [];
  if (fields.hqSuburb?.trim()) {
    locationParts.push(fields.hqSuburb.trim());
  }
  if (fields.hqState?.trim()) {
    locationParts.push(fields.hqState.trim());
  }
  if (fields.hqPostcode?.trim()) {
    locationParts.push(fields.hqPostcode.trim());
  }
  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }

  if (parts.length === 0) return '';
  parts.push('Australia');

  return parts.join(', ');
}
