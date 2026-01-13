import { NextResponse } from 'next/server';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getAuthorizeUrl } from '@/lib/integrations/xero';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return NextResponse.json(context, { status: 401 });
  if (!canManageOrgSettings(context.data.actor)) {
    return NextResponse.json({ ok: false, error: { message: 'Insufficient permissions' } }, { status: 403 });
  }

  const urlResult = await getAuthorizeUrl(context.data.orgId, req);
  if (!urlResult.ok) {
    return NextResponse.json({ ok: false, error: urlResult.error }, { status: 400 });
  }

  return NextResponse.redirect(urlResult.data);
}
