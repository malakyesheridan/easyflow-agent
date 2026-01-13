import { getVisibilityMode, type RequestActor } from '@/lib/authz';

export type Surface = 'admin' | 'crew';

export type DeviceHints = {
  isMobile?: boolean;
  userAgent?: string | null;
};

export type SurfaceSettings = {
  forceSurface?: Surface | null;
  preferCrewOnMobile?: boolean;
};

const MOBILE_UA_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const ADMIN_ROLE_KEYS = new Set(['admin', 'manager']);

export function isLikelyMobileUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}

export function isAdminLikeActor(actor: RequestActor | null): boolean {
  if (!actor?.userId) return false;
  const roleKey = actor.roleKey?.trim().toLowerCase();
  if (roleKey && ADMIN_ROLE_KEYS.has(roleKey)) return true;
  return getVisibilityMode(actor) === 'orgWide';
}

export function getSurface(
  actor: RequestActor | null,
  device?: DeviceHints,
  settings?: SurfaceSettings
): Surface {
  if (settings?.forceSurface) return settings.forceSurface;

  const isMobile =
    typeof device?.isMobile === 'boolean' ? device.isMobile : isLikelyMobileUserAgent(device?.userAgent ?? null);
  const adminLike = isAdminLikeActor(actor);

  if (adminLike && !isMobile) return 'admin';
  if (!adminLike) return 'crew';
  if (settings?.preferCrewOnMobile) return 'crew';
  return 'admin';
}
