'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function SignupPage() {
  const router = useRouter();
  const [inviteToken, setInviteToken] = useState('');

  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('invite') || '');
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!inviteToken && !orgName.trim()) {
      setError('Organization name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orgName: orgName.trim() || undefined,
          name: name.trim(),
          email: email.trim(),
          password,
          inviteToken: inviteToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error?.message || 'Unable to create account.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={inviteToken ? 'Join your team' : 'Create your account'}
      subtitle={inviteToken ? 'Complete your profile to get started' : 'Set up your organization and admin user'}
      footer={
        <span>
          Already have an account?{' '}
          <Link className="text-accent-gold hover:text-accent-gold/80" href="/login">
            Sign in
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
        {!inviteToken && (
          <Input
            label="Organization name"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            required
          />
        )}
        <Input
          label="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
