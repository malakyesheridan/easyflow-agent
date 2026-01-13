import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { jsonResult } from '@/lib/api-response';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { users } from '@/db/schema/users';
import { passwordResets } from '@/db/schema/password_resets';
import { hashPassword } from '@/lib/auth/passwords';
import { userSessions } from '@/db/schema/user_sessions';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';

const resetSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload'));
    }

    const { token, password } = parsed.data;
    const clientId = getClientId(req);
    const rateLimitResult = rateLimit({
      req,
      key: 'auth:reset-password',
      limit: 5,
      windowMs: 60_000,
      identifier: clientId,
    });
    if (!rateLimitResult.ok) return jsonResult(rateLimitResult);

    const tokenHash = hashToken(token);
    const now = new Date();

    const db = getDb();
    const [resetRow] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt)))
      .limit(1);

    if (!resetRow || (resetRow.expiresAt && new Date(resetRow.expiresAt) < now)) {
      return jsonResult(err('INVALID_TOKEN', 'Reset link is invalid or expired'));
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: hashPassword(password), updatedAt: now })
        .where(eq(users.id, resetRow.userId));

      await tx
        .update(userSessions)
        .set({ revokedAt: now })
        .where(eq(userSessions.userId, resetRow.userId));

      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(eq(passwordResets.id, resetRow.id));
    });

    return jsonResult(ok({}));
  } catch (error) {
    return jsonResult(err('INTERNAL_ERROR', 'Failed to reset password', error));
  }
}
