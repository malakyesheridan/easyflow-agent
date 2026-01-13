'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setResetToken(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error?.message || 'Unable to request a reset link.');
        return;
      }

      setSuccessMessage('If that email exists, a reset link is on its way.');
      if (data?.data?.resetToken) {
        setResetToken(String(data.data.resetToken));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request a reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a reset link if the address matches"
      footer={
        <span>
          Remembered your password?{' '}
          <Link className="text-accent-gold hover:text-accent-gold/80" href="/login">
            Back to sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Sending link...' : 'Send reset link'}
        </Button>
        {resetToken && (
          <div className="rounded-md border border-border-subtle bg-bg-section px-3 py-2 text-xs text-text-secondary">
            Dev reset link:{' '}
            <Link
              className="text-accent-gold hover:text-accent-gold/80"
              href={`/reset-password?token=${resetToken}`}
            >
              Reset password
            </Link>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
