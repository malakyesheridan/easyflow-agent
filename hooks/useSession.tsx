'use client';

import { useEffect, useState } from 'react';
import type { RequestActor } from '@/lib/authz';

type SessionPayload = {
  user?: { id: string; email: string; name: string | null } | null;
  org?: { id: string } | null;
  actor?: RequestActor | null;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

let cachedSession: SessionPayload | null = null;
let inflight: Promise<SessionPayload | null> | null = null;
let cachedAt = 0;

async function fetchSession(): Promise<SessionPayload | null> {
  const now = Date.now();
  if (cachedSession && now - cachedAt < 60_000) {
    return cachedSession;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = (await res.json()) as ApiResponse<SessionPayload>;
      if (!res.ok || !json.ok) {
        cachedSession = null;
      } else {
        cachedSession = json.data;
      }
      cachedAt = Date.now();
      return cachedSession;
    } catch {
      cachedSession = null;
      cachedAt = Date.now();
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useSession() {
  const [session, setSession] = useState<SessionPayload | null>(cachedSession);
  const [loading, setLoading] = useState(cachedSession === null);

  useEffect(() => {
    let mounted = true;
    fetchSession().then((data) => {
      if (!mounted) return;
      setSession(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { session, loading };
}
