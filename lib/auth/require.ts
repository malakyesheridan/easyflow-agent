import { err, ok, type Result } from '@/lib/result';
import { requireSession, type SessionContext } from '@/lib/auth/session';
import { ZERO_UUID } from '@/lib/org/orgId';

export type OrgContext = {
  orgId: string;
  session: SessionContext;
  actor: SessionContext['actor'];
};

export async function requireOrgContext(
  req: Request,
  orgId?: string | null
): Promise<Result<OrgContext>> {
  const sessionResult = await requireSession(req);
  if (!sessionResult.ok) return sessionResult;

  const session = sessionResult.data;
  const trimmedOrgId = orgId?.trim();
  const resolvedOrgId = !trimmedOrgId || trimmedOrgId === ZERO_UUID ? session.org.id : trimmedOrgId;
  if (resolvedOrgId !== session.org.id) {
    return err('FORBIDDEN', 'Invalid organization access');
  }

  return ok({
    orgId: resolvedOrgId,
    session,
    actor: session.actor,
  });
}
