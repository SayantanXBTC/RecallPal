'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowser } from '@/lib/supabase-client';

/**
 * OAuth landing page. Supabase redirects here after Google finishes and
 * puts the session in the URL fragment / query. We ask supabase-js to
 * parse it, forward the resulting session into our AuthContext, then
 * bounce to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { hydrateSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }
    (async () => {
      // exchangeCodeForSession for PKCE flow; getSession picks up implicit flow.
      const url = window.location.href;
      try {
        if (url.includes('code=')) {
          await supabase.auth.exchangeCodeForSession(url);
        }
      } catch {
        // exchange may fail if URL already consumed — fall back to getSession
      }
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session || !data.session.user) {
        setError(error?.message || 'Sign-in was cancelled or expired. Please try again.');
        setTimeout(() => router.replace('/login'), 2500);
        return;
      }
      const s = data.session;
      hydrateSession(
        s.access_token,
        s.refresh_token,
        { id: s.user.id, email: s.user.email ?? '' },
        s.expires_in ?? 3600,
      );
      // Wipe the URL fragment before navigating away so tokens don't
      // linger in the browser history.
      window.history.replaceState({}, '', '/dashboard');
      router.replace('/dashboard');
    })();
  }, [router, hydrateSession]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <p className="font-serif text-2xl mb-2" style={{ color: '#3A2F28' }}>Sign-in failed</p>
          <p className="font-dm-sans text-sm text-amber-600 max-w-sm">{error}</p>
        </>
      ) : (
        <>
          <div className="w-10 h-10 border-2 rounded-full animate-spin mb-4"
               style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }} />
          <p className="font-dm-sans text-sm" style={{ color: '#6B5C52' }}>
            Finishing sign-in…
          </p>
        </>
      )}
    </main>
  );
}
