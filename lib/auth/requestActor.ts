import { getSessionContext } from '@/lib/auth/session';
import type { RequestActor } from '@/lib/authz';

export async function getRequestActor(params: {
  req: Request;
  orgId?: string;
}): Promise<RequestActor> {
  const session = await getSessionContext(params.req);
  if (!session) {
    return { userId: null, orgId: null, crewMemberId: null, roleKey: null, capabilities: [], isImpersonating: false };
  }
  if (params.orgId && params.orgId !== session.org.id) {
    return { userId: null, orgId: null, crewMemberId: null, roleKey: null, capabilities: [], isImpersonating: false };
  }
  return session.actor;
}
