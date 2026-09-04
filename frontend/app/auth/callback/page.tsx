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
      const url    = window.location.href;
      const hash   = window.location.hash || '';
      const search = window.location.search || '';

      // Supabase can return the session in two shapes depending on the
      // provider config: PKCE (?code=...) or implicit (#access_token=...).
      // Using a loose interim type — supabase-js Session is stricter than
      // what we thread into hydrateSession.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let session: any = null;

      // ---- Provider-side error surfaced in query or fragment -------------
      const errParams = new URLSearchParams(
        search.startsWith('?') ? search.slice(1) : hash.startsWith('#') ? hash.slice(1) : '',
      );
      const errCode = errParams.get('error') || errParams.get('error_code');
      const errMsg  = errParams.get('error_description') || errParams.get('message');
      if (errCode) {
        setError(errMsg ? decodeURIComponent(errMsg.replace(/\+/g, ' ')) : `Google sign-in failed (${errCode}).`);
        setTimeout(() => router.replace('/login'), 3000);
        return;
      }

      // ---- PKCE flow: ?code=... -----------------------------------------
      if (url.includes('code=')) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) {
            setError(error.message || 'Sign-in failed during token exchange.');
            setTimeout(() => router.replace('/login'), 3000);
            return;
          }
          if (data?.session) session = data.session;
        } catch (e) {
          setError((e as Error)?.message || 'Sign-in exchange failed.');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }
      }

      // ---- Implicit flow: #access_token=... -----------------------------
      if (!session && hash.includes('access_token=')) {
        const p = new URLSearchParams(hash.slice(1));
        const access  = p.get('access_token');
        const refresh = p.get('refresh_token');
        const expires = parseInt(p.get('expires_in') || '3600', 10);
        if (access && refresh) {
          const { data, error } = await supabase.auth.setSession({
            access_token:  access,
            refresh_token: refresh,
          });
          if (!error && data.session) {
            session = { ...data.session, expires_in: expires };
          }
        }
      }

      if (!session || !session.user) {
        setError('Sign-in was cancelled or expired. Please try again.');
        setTimeout(() => router.replace('/login'), 2500);
        return;
      }

      const meta = session.user.user_metadata || {};
      hydrateSession(
        session.access_token,
        session.refresh_token,
        {
          id:            session.user.id,
          email:         session.user.email ?? '',
          display_name:  meta.full_name || meta.name || null,
          avatar_url:    meta.avatar_url || meta.picture || null,
        },
        session.expires_in ?? 3600,
      );
      // Wipe tokens from history before navigating away.
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
