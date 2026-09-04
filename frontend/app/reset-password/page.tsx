'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase-client';

/**
 * Landing page for the password-reset email link. Supabase drops the
 * recovery session in the URL fragment; supabase-js picks it up on
 * mount (detectSessionInUrl=true), then we let the user set a new
 * password via supabase.auth.updateUser.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready,    setReady]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError('Password reset is not configured. Contact support.');
      return;
    }
    (async () => {
      const url  = window.location.href;
      const hash = window.location.hash || '';
      try {
        if (url.includes('code=')) {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) { setError(error.message); return; }
        } else if (hash.includes('access_token=')) {
          const p = new URLSearchParams(hash.slice(1));
          const access  = p.get('access_token');
          const refresh = p.get('refresh_token');
          if (access && refresh) {
            const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
            if (error) { setError(error.message); return; }
          }
        } else {
          setError('This reset link has expired or is invalid. Please request a new one.');
          return;
        }
      } catch (e) {
        setError((e as Error)?.message || 'Reset link failed to open.');
        return;
      }
      setReady(true);
      window.history.replaceState({}, '', '/reset-password');
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setError(error.message || 'Could not update password.'); return; }
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => router.replace('/login'), 2200);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl p-8 shadow-warm-md"
        style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.8)' }}>

        <h1 className="font-serif text-3xl mb-2" style={{ color: '#3A2F28' }}>Set a new password</h1>
        <p className="font-dm-sans text-sm mb-6" style={{ color: '#6B5C52' }}>
          Choose a new password for your RecallPal account.
        </p>

        {done ? (
          <p className="font-dm-sans text-sm" style={{ color: '#0f766e' }}>
            Password updated. Redirecting to sign in…
          </p>
        ) : ready ? (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1" style={{ color: '#8A7D72' }}>New password</label>
              <input type="password" required minLength={6} autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1" style={{ color: '#8A7D72' }}>Confirm password</label>
              <input type="password" required minLength={6} autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>
            {error && <p className="text-xs text-amber-600 font-dm-sans">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-full py-3 font-semibold text-white text-sm shadow-gold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : error ? (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(246,173,85,0.10)', border: '1px solid rgba(246,173,85,0.35)' }}>
            <p className="text-sm text-amber-700 font-dm-sans">{error}</p>
          </div>
        ) : (
          <p className="text-sm font-dm-sans" style={{ color: '#8A7D72' }}>Verifying reset link…</p>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="font-dm-sans text-sm hover:underline" style={{ color: '#C9943A' }}>
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
