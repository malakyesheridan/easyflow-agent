'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useSession } from '@/hooks/useSession';

export default function ProfileView() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const user = session?.user;
  const org = session?.org;

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse">
          <div className="h-4 w-40 rounded bg-bg-section/80" />
          <div className="mt-3 h-3 w-24 rounded bg-bg-section/80" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">Signed in as</p>
          <p className="text-lg font-semibold text-text-primary">{user?.name || 'Crew member'}</p>
          <p className="text-sm text-text-tertiary">{user?.email || 'No email available'}</p>
          {org?.id && (
            <p className="text-xs text-text-tertiary">Org: {org.id.slice(0, 8)}...</p>
          )}
        </div>
      </Card>

      <Card>
        <p className="text-sm text-text-secondary mb-3">Account</p>
        <Button variant="secondary" className="w-full" onClick={logout} disabled={loggingOut}>
          {loggingOut ? 'Signing out...' : 'Sign out'}
        </Button>
      </Card>
    </div>
  );
}
