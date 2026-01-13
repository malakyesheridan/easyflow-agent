export type IntegrationRegistryEntry = {
  provider: string;
  name: string;
  category: 'payments' | 'inventory' | 'accounting' | 'custom';
  description: string;
  requiredFields: string[];
  optionalFields?: string[];
  supports: string[];
};

export const IntegrationRegistry = {
  stripe: {
    provider: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'Accept payments and reconcile invoices.',
    requiredFields: ['api_key', 'webhook_secret'],
    supports: ['payments', 'invoices'],
  },
  inventory_generic: {
    provider: 'inventory_generic',
    name: 'Inventory System',
    category: 'inventory',
    description: 'Sync stock levels with a third-party inventory tool.',
    requiredFields: [],
    optionalFields: ['api_key', 'base_url', 'reserve_endpoint', 'deduct_endpoint', 'sync_endpoint'],
    supports: ['stock_sync'],
  },
  xero: {
    provider: 'xero',
    name: 'Xero',
    category: 'accounting',
    description: 'Push invoices and reconcile payments.',
    requiredFields: ['client_id', 'client_secret'],
    supports: ['invoices', 'payments'],
  },
  custom_api: {
    provider: 'custom_api',
    name: 'Custom API',
    category: 'custom',
    description: 'Connect a bespoke API with custom credentials.',
    requiredFields: ['endpoint_url'],
    optionalFields: ['api_key', 'secret'],
    supports: ['custom'],
  },
} as const satisfies Record<string, IntegrationRegistryEntry>;

export type IntegrationProvider = keyof typeof IntegrationRegistry;
export const IntegrationProviders = Object.keys(IntegrationRegistry) as IntegrationProvider[];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return Object.prototype.hasOwnProperty.call(IntegrationRegistry, value);
}
