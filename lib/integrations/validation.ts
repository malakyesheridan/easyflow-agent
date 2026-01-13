import { IntegrationRegistry, type IntegrationProvider } from '@/lib/integrations/registry';

export function getMissingRequiredFields(
  provider: IntegrationProvider,
  credentials: Record<string, string>
): string[] {
  const entry = IntegrationRegistry[provider];
  const missing: string[] = [];

  for (const field of entry.requiredFields) {
    const value = credentials[field];
    if (!value || !value.trim()) {
      missing.push(field);
    }
  }

  return missing;
}
