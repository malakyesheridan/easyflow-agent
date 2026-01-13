'use client';

import NotificationsCenter from '@/components/notifications/NotificationsCenter';
import { useOrgConfig } from '@/hooks/useOrgConfig';

export default function NotificationsView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const resolvedOrgId = orgId || config?.orgId || '';
  return <NotificationsCenter orgId={resolvedOrgId} />;
}
