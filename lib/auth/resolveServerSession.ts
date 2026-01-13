import { headers } from 'next/headers';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import type { RequestActor } from '@/lib/authz';

export async function resolveServerSession(searchParams?: Record<string, string | string[] | undefined>): Promise<{
  orgId: string;
  actor: RequestActor;
  session: SessionContext;
} | null> {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  if (!cookie) return null;
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) return null;
  const orgId = fromQuery && fromQuery === session.org.id ? fromQuery : session.org.id;
  return { orgId, actor: session.actor, session };
}
