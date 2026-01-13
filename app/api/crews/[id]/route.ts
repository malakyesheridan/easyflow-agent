import { NextRequest, NextResponse } from 'next/server';
import { getCrewMemberById } from '@/lib/queries/crew_members';
import { requireOrgContext } from '@/lib/auth/require';

export async function GET(request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) {
      const status = context.error.code === 'UNAUTHORIZED' ? 401 : 403;
      return NextResponse.json({ ok: false, error: context.error }, { status });
    }

    const id = ctx?.params?.id;
    const result = await getCrewMemberById({ orgId: context.data.orgId, id });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.error.code === 'NOT_FOUND' ? 404 : 500 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    console.error('Error in GET /api/crews/[id]:', error);
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, { status: 500 });
  }
}
