'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { getSupabaseBrowser, isOAuthConfigured } from '@/lib/supabase-client';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, signup } = useAuth();

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [user, authLoading, router]);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [notice,   setNotice]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signup(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (msg.toLowerCase().includes('check your email') || msg.toLowerCase().includes('confirm')) {
        setNotice(msg);
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full animate-float"
             style={{ background: 'radial-gradient(circle,rgba(214,233,248,0.5) 0%,transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 rounded-full animate-float-slow"
             style={{ background: 'radial-gradient(circle,rgba(253,223,196,0.55) 0%,transparent 70%)', filter: 'blur(55px)' }} />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-md"
      >
        <motion.div variants={fadeUp} custom={0}
          className="rounded-3xl p-8 md:p-10 shadow-warm-lg border border-white/70"
          style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)' }}>

          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <span className="font-serif text-3xl font-bold"
                    style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                RecallPal
              </span>
            </Link>
            <p className="font-dm-sans text-text-mid text-sm mt-1">Create your free account — it only takes a moment.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block font-dm-sans text-sm font-medium text-text-mid mb-1.5" htmlFor="email">
                Email address <span className="text-gold">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 font-dm-sans text-sm text-text-dark border border-black/10 outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/15 transition-all"
                style={{ background: 'rgba(255,255,255,0.8)' }}
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block font-dm-sans text-sm font-medium text-text-mid mb-1.5" htmlFor="password">
                Password <span className="text-gold">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 pr-11 font-dm-sans text-sm text-text-dark border border-black/10 outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/15 transition-all"
                  style={{ background: 'rgba(255,255,255,0.8)' }}
                  placeholder="At least 6 characters"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-soft hover:text-gold transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block font-dm-sans text-sm font-medium text-text-mid mb-1.5" htmlFor="confirm">
                Confirm password <span className="text-gold">*</span>
              </label>
              <input
                id="confirm"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 font-dm-sans text-sm text-text-dark border border-black/10 outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/15 transition-all"
                style={{ background: 'rgba(255,255,255,0.8)' }}
                placeholder="Repeat your password"
              />
            </div>

            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl px-4 py-3 text-sm font-dm-sans border"
                style={{ background: 'rgba(253,220,225,0.6)', borderColor: 'rgba(217,123,138,0.3)', color: '#9B3A4A' }}>
                {error}
              </motion.div>
            )}

            {/* Email-confirmation notice */}
            {notice && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl px-4 py-3 text-sm font-dm-sans border"
                style={{ background: 'rgba(225,242,254,0.75)', borderColor: 'rgba(100,181,246,0.4)', color: '#1565C0' }}>
                {notice}
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.97 }}
              className="w-full py-3.5 rounded-2xl font-dm-sans font-semibold text-white shadow-gold disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-1"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : 'Create Account'}
            </motion.button>

            {isOAuthConfigured() && (
              <>
                <div className="flex items-center gap-3 my-1">
                  <span className="flex-1 h-px bg-black/10" />
                  <span className="text-[10px] font-semibold tracking-widest uppercase text-text-mid">or</span>
                  <span className="flex-1 h-px bg-black/10" />
                </div>
                <button type="button"
                  onClick={async () => {
                    setError(null);
                    const supabase = getSupabaseBrowser();
                    if (!supabase) { setError('Google sign-in is not configured.'); return; }
                    setLoading(true);
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options:  { redirectTo: `${window.location.origin}/auth/callback` },
                    });
                    if (error) { setError(error.message); setLoading(false); }
                  }}
                  disabled={loading}
                  className="w-full py-3 rounded-2xl font-dm-sans font-semibold text-sm flex items-center justify-center gap-3 bg-white text-text-dark disabled:opacity-50"
                  style={{ border: '1px solid rgba(0,0,0,0.10)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.3 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
          </form>

          <p className="text-center font-dm-sans text-sm text-text-soft mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-gold font-medium hover:underline">
              Log in
            </Link>
          </p>
        </motion.div>

        <p className="text-center font-dm-sans text-xs text-text-soft mt-5">
          <Link href="/" className="hover:text-gold transition-colors">← Back to home</Link>
        </p>
      </motion.div>
    </div>
  );
}
