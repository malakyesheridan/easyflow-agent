import { jsonResult } from '@/lib/api-response';
import { requireSession } from '@/lib/auth/session';

export async function GET(req: Request) {
  const sessionResult = await requireSession(req);
  if (!sessionResult.ok) return jsonResult(sessionResult);
  return Response.json({ message: 'API route' });
}

