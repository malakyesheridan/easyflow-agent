export function buildListingLabel(address: string | null, suburb: string | null) {
  if (address && suburb) return `${address}, ${suburb}`;
  return address || suburb || 'Listing';
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatShortDateTime(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
