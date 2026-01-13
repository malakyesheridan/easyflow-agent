import { createBrowserClient } from '@supabase/ssr';

function getSupabaseBrowserEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return { url, anonKey };
}

export function createClientSupabase() {
  const { url, anonKey } = getSupabaseBrowserEnv();
  return createBrowserClient(url, anonKey);
}
