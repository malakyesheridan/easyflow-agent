import { runDailyCrewDigest } from '@/lib/communications/digest';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

async function main() {
  const orgId = process.env.ORG_ID || process.env.NEXT_PUBLIC_ORG_ID || undefined;
  const date = process.env.DATE || undefined;
  const includeTomorrow = parseBoolean(process.env.INCLUDE_TOMORROW, false);
  const sendEmpty = parseBoolean(process.env.SEND_EMPTY, false);
  const force = parseBoolean(process.env.FORCE, false);

  if (!orgId) {
    throw new Error('ORG_ID is required.');
  }

  await runDailyCrewDigest({
    orgId,
    date,
    includeTomorrow,
    sendEmpty,
    force,
    source: 'script',
  });
}

main().catch((error) => {
  console.error('Daily crew digest failed:', error);
  process.exit(1);
});
