export function isClientInOrg(clientOrgId: string | null | undefined, orgId: string): boolean {
  if (!clientOrgId) return false;
  return clientOrgId === orgId;
}
