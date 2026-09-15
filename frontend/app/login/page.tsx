'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { getSupabaseBrowser, isOAuthConfigured } from '@/lib/supabase-client';

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login, signup } = useAuth();

  const [mode,     setMode]     = useState<'login' | 'signup'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [notice,   setNotice]   = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [user, authLoading, router]);

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        router.replace('/dashboard');
      } else {
        await signup(email, password);
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      if (msg.toLowerCase().includes('check your email') || msg.toLowerCase().includes('confirm')) {
        setNotice(msg);
      } else if (
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('networkerror') ||
        msg.toLowerCase().includes('load failed')
      ) {
        setError('Backend unreachable — check your connection or try again in a moment.');
      } else {
        setError(msg || (mode === 'login' ? 'Incorrect email or password.' : 'Could not create account.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-2xl px-4 py-3 font-inter text-sm outline-none transition-all ' +
    'bg-white/[0.03] border border-white/10 text-white placeholder:text-white/30 ' +
    'focus:border-white/25 focus:bg-white/[0.05]';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden marketing-root font-inter">

      {/* Cinematic background — video + scrim + tint */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden style={{ zIndex: 0 }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
            type="video/mp4"
          />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, var(--m-scrim-top) 0%, var(--m-scrim-mid) 40%, var(--m-scrim-bot) 100%)',
          }}
        />
        <div
          className="absolute inset-0 mix-blend-color"
          style={{
            background:
              'radial-gradient(ellipse 90% 60% at 50% 0%, var(--m-tint-a) 0%, transparent 60%),' +
              'radial-gradient(ellipse 70% 50% at 85% 100%, var(--m-tint-b) 0%, transparent 65%),' +
              'linear-gradient(180deg, var(--m-tint-base) 0%, var(--m-tint-base-b) 100%)',
          }}
        />
        <div
          className="absolute w-[520px] h-[520px] rounded-full opacity-60"
          style={{
            top:    '-10%',
            left:   '-8%',
            background: 'radial-gradient(circle, var(--m-orb-a) 0%, transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute w-[560px] h-[560px] rounded-full opacity-60"
          style={{
            bottom: '-14%',
            right:  '-10%',
            background: 'radial-gradient(circle, var(--m-orb-b) 0%, transparent 65%)',
            filter: 'blur(90px)',
          }}
        />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          variants={fadeUp}
          custom={0}
          className="liquid-glass liquid-glass-strong rounded-3xl p-8 md:p-10"
        >
          {/* Logo */}
          <div className="text-center mb-7">
            <Link href="/" className="inline-block">
              <span
                className="font-inter text-3xl font-light tracking-tight accent"
                style={{ letterSpacing: '-0.03em' }}
              >
                RecallPal
              </span>
            </Link>
            <p className="font-inter font-light text-sm mt-2 text-white/60">
              {mode === 'login' ? "Welcome back — you've been missed." : 'Create your account — it only takes a moment.'}
            </p>
          </div>

          {/* Mode toggle tabs */}
          <div
            className="flex rounded-2xl p-1 mb-6"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-medium font-inter transition-all"
                style={
                  mode === m
                    ? {
                        background: 'rgba(255,255,255,0.10)',
                        color: '#F5F7FA',
                        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.14)',
                      }
                    : { color: 'rgba(245,247,250,0.45)' }
                }
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block font-inter text-xs font-medium mb-1.5 text-white/60 tracking-wide" htmlFor="auth-email">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className={inputCls}
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block font-inter text-xs font-medium mb-1.5 text-white/60 tracking-wide" htmlFor="auth-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className={inputCls + ' pr-11'}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <AnimatePresence>
              {mode === 'signup' && (
                <motion.div
                  key="confirm"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <label className="block font-inter text-xs font-medium mb-1.5 text-white/60 tracking-wide" htmlFor="auth-confirm">
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    required={mode === 'signup'}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    className={inputCls}
                    placeholder="Repeat your password"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl px-4 py-3 text-sm font-inter font-light border"
                  style={{
                    background: 'rgba(217,123,138,0.10)',
                    borderColor: 'rgba(217,123,138,0.30)',
                    color: '#F4A0AE',
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notice banner */}
            <AnimatePresence>
              {notice && (
                <motion.div
                  key="notice"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl px-4 py-3 text-sm font-inter font-light border"
                  style={{
                    background: 'rgba(107,201,255,0.10)',
                    borderColor: 'rgba(107,201,255,0.30)',
                    color: '#BEE0FF',
                  }}
                >
                  {notice}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit — glass primary */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="glass-btn glass-btn-primary w-full justify-center py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </motion.button>

            {/* Forgot password (login mode only) */}
            {mode === 'login' && (
              <div className="text-center -mt-1">
                <Link
                  href="/forgot-password"
                  className="font-inter text-xs font-light text-white/60 hover:text-white transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {/* Divider + Google OAuth */}
            {isOAuthConfigured() && (
              <>
                <div className="flex items-center gap-3 my-3">
                  <span className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-white/40">or</span>
                  <span className="flex-1 h-px bg-white/10" />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    const supabase = getSupabaseBrowser();
                    if (!supabase) { setError('Google sign-in is not configured.'); return; }
                    setLoading(true);
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options:  {
                        redirectTo: `${window.location.origin}/auth/callback`,
                        queryParams: {
                          prompt: 'select_account',
                          access_type: 'offline',
                        },
                      },
                    });
                    if (error) { setError(error.message); setLoading(false); }
                  }}
                  disabled={loading}
                  className="glass-btn w-full justify-center py-3 disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.3 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
          </form>

          {/* Footer link */}
          <p className="text-center font-inter font-light text-sm mt-6 text-white/45">
            {mode === 'login' ? (
              <>No account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-white/85 font-medium hover:text-white transition-colors"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-white/85 font-medium hover:text-white transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </motion.div>

        <p className="text-center font-inter font-light text-xs mt-5 text-white/40">
          <Link href="/" className="hover:text-white/80 transition-colors">← Back to home</Link>
        </p>
      </motion.div>
    </div>
  );
}
