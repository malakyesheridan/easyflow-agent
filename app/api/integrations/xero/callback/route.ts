import { NextResponse } from 'next/server';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { handleOAuthCallback, parseXeroOAuthState } from '@/lib/integrations/xero';

function resolveBaseUrl(req: Request): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const baseUrl = resolveBaseUrl(req);

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?xero=error`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?xero=invalid`);
  }

  const stateResult = parseXeroOAuthState(state);
  if (!stateResult.ok) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?xero=invalid`);
  }

  const context = await requireOrgContext(req, stateResult.data.orgId);
  if (!context.ok) return NextResponse.json(context, { status: 401 });
  if (!canManageOrgSettings(context.data.actor)) {
    return NextResponse.json({ ok: false, error: { message: 'Insufficient permissions' } }, { status: 403 });
  }

  const result = await handleOAuthCallback({ code, state, req });
  if (!result.ok) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?xero=error`);
  }

  return NextResponse.redirect(`${baseUrl}/settings/integrations?orgId=${stateResult.data.orgId}&xero=connected`);
}
