import { canManageClients, canManageJobs, canManageOperations, canManageOrgSettings, type RequestActor } from '@/lib/authz';

export function canAccessSettingsRoutes(actor: RequestActor): boolean {
  return canManageOrgSettings(actor);
}

export function canAccessIntegrationsRoutes(actor: RequestActor): boolean {
  return canManageOrgSettings(actor);
}

export function canAccessOperationsIntelligence(actor: RequestActor): boolean {
  return canManageOperations(actor);
}

export function canAccessFinancials(actor: RequestActor): boolean {
  return canManageJobs(actor);
}

export function canAccessClientsRoutes(actor: RequestActor): boolean {
  return canManageClients(actor);
}
