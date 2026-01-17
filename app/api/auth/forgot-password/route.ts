import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { jsonResult } from '@/lib/api-response';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { users } from '@/db/schema/users';
import { passwordResets } from '@/db/schema/password_resets';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';
import { sendResendEmail } from '@/lib/communications/providers/resend';
import { getDefaultSenderIdentity, isValidEmail } from '@/lib/communications/sender';
import { getBaseUrl } from '@/lib/url';

const forgotSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload'));
    }

    const email = parsed.data.email.trim().toLowerCase();
    const clientId = getClientId(req);
    const rateLimitResult = rateLimit({
      req,
      key: 'auth:forgot-password',
      limit: 5,
      windowMs: 60_000,
      identifier: `${clientId}:${email}`,
    });
    if (!rateLimitResult.ok) return jsonResult(rateLimitResult);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      return jsonResult(ok({}));
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const forwardedFor = req.headers.get('x-forwarded-for');
    const requestedIp = forwardedFor ? forwardedFor.split(',')[0].trim() : null;
    const userAgent = req.headers.get('user-agent');

    await db.transaction(async (tx) => {
      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

      await tx.insert(passwordResets).values({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp,
        userAgent,
      });
    });

    const responsePayload: Record<string, string> = {};
    if (process.env.NODE_ENV !== 'production') {
      responsePayload.resetToken = token;
    }

    const baseUrl = getBaseUrl(req) || req.headers.get('origin') || 'http://localhost:3000';
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    const sender = getDefaultSenderIdentity();
    const fromEmail = sender.fromEmail && isValidEmail(sender.fromEmail) ? sender.fromEmail : null;
    const fromName = sender.fromName?.trim() || null;
    const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;

    if (process.env.RESEND_API_KEY && from) {
      const subject = 'Reset your TGW Operations password';
      const html = `
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `;
      const text = `Reset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`;
      const result = await sendResendEmail({
        apiKey: process.env.RESEND_API_KEY,
        from,
        to: email,
        subject,
        html,
        text,
        replyTo: sender.replyTo || undefined,
      });
      if (!result.ok) {
        console.warn('Password reset email failed:', result.error);
      }
    } else {
      console.warn('Password reset email skipped: missing RESEND_API_KEY or COMM_DEFAULT_FROM_EMAIL');
    }

    return jsonResult(ok(responsePayload));
  } catch (error) {
    return jsonResult(err('INTERNAL_ERROR', 'Failed to start password reset', error));
  }
}
