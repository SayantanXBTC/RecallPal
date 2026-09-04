'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { getSupabaseBrowser, isOAuthConfigured } from '@/lib/supabase-client';

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login, signup } = useAuth();
  const { theme } = useTheme();
  const dark = theme === 'dark';

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
      } else {
        setError(msg || (mode === 'login' ? 'Incorrect email or password.' : 'Could not create account.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Theme tokens
  const pageBg    = dark
    ? 'linear-gradient(135deg,#0A0804 0%,#120E08 50%,#0E0B06 100%)'
    : 'linear-gradient(135deg,#FAF6F1 0%,#EEF4FB 45%,#FDF0E8 100%)';
  const blob1     = dark ? 'rgba(201,148,58,0.10)' : 'rgba(214,233,248,0.50)';
  const blob2     = dark ? 'rgba(240,201,122,0.08)' : 'rgba(253,223,196,0.50)';
  const cardBg    = dark ? 'rgba(28,22,14,0.88)'   : 'rgba(255,255,255,0.72)';
  const cardBorder = dark ? 'rgba(201,148,58,0.20)' : 'rgba(255,255,255,0.70)';
  const hColor    = dark ? '#F5EFE8' : '#3A2F28';
  const bColor    = dark ? '#C4B09A' : '#6B5C52';
  const sColor    = dark ? '#7A6E64' : '#9A8C84';
  const tabBg     = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const tabActive = dark ? { background: 'rgba(52,41,24,0.90)', color: '#F5EFE8', boxShadow: '0 1px 6px rgba(0,0,0,0.40)' }
                        : { background: 'white',                color: '#3A2F28', boxShadow: '0 1px 6px rgba(0,0,0,0.10)' };
  const tabInactive = dark ? '#7A6E64' : '#9A8C84';
  const inputBg   = dark ? 'rgba(40,32,18,0.80)' : 'rgba(255,255,255,0.80)';
  const inputBorder = dark ? 'rgba(201,148,58,0.18)' : 'rgba(0,0,0,0.10)';
  const inputColor = dark ? '#F5EFE8' : '#3A2F28';
  const placeholderStyle = dark ? { color: '#5A5048' } : {};

  const inputCls =
    'w-full rounded-2xl px-4 py-3 font-dm-sans text-sm outline-none transition-all ' +
    'focus:ring-2 focus:ring-gold/25';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: pageBg }}
    >
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full animate-float"
          style={{ background: `radial-gradient(circle,${blob1} 0%,transparent 70%)`, filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full animate-float-slow"
          style={{ background: `radial-gradient(circle,${blob2} 0%,transparent 70%)`, filter: 'blur(55px)' }} />
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="relative z-10 w-full max-w-md">
        <motion.div variants={fadeUp} custom={0}
          className="rounded-3xl p-8 md:p-10 shadow-warm-lg border"
          style={{ background: cardBg, backdropFilter: 'blur(24px)', borderColor: cardBorder }}>

          {/* Logo */}
          <div className="text-center mb-7">
            <Link href="/" className="inline-block">
              <span className="font-serif text-3xl font-bold"
                style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                RecallPal
              </span>
            </Link>
            <p className="font-dm-sans text-sm mt-1" style={{ color: bColor }}>
              {mode === 'login' ? "Welcome back — you've been missed." : 'Create your account — it only takes a moment.'}
            </p>
          </div>

          {/* Mode toggle tabs */}
          <div className="flex rounded-2xl p-1 mb-6" style={{ background: tabBg }}>
            {(['login', 'signup'] as const).map((m) => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold font-dm-sans transition-all"
                style={mode === m ? tabActive : { color: tabInactive }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block font-dm-sans text-sm font-medium mb-1.5" style={{ color: bColor }} htmlFor="auth-email">
                Email address
              </label>
              <input id="auth-email" type="email" autoComplete="email" required
                value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className={inputCls}
                style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputColor, ...placeholderStyle }}
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block font-dm-sans text-sm font-medium mb-1.5" style={{ color: bColor }} htmlFor="auth-password">
                Password
              </label>
              <div className="relative">
                <input id="auth-password" type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className={inputCls + ' pr-11'}
                  style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputColor }}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-gold transition-colors"
                  style={{ color: sColor }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <AnimatePresence>
              {mode === 'signup' && (
                <motion.div key="confirm"
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                  className="overflow-hidden">
                  <label className="block font-dm-sans text-sm font-medium mb-1.5" style={{ color: bColor }} htmlFor="auth-confirm">
                    Confirm password
                  </label>
                  <input id="auth-confirm" type={showPw ? 'text' : 'password'}
                    autoComplete="new-password" required={mode === 'signup'}
                    value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    className={inputCls}
                    style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: inputColor }}
                    placeholder="Repeat your password"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div key="error"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl px-4 py-3 text-sm font-dm-sans border"
                  style={dark
                    ? { background: 'rgba(80,20,28,0.60)', borderColor: 'rgba(217,123,138,0.25)', color: '#F4A0AE' }
                    : { background: 'rgba(253,220,225,0.60)', borderColor: 'rgba(217,123,138,0.30)', color: '#9B3A4A' }}>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notice banner */}
            <AnimatePresence>
              {notice && (
                <motion.div key="notice"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl px-4 py-3 text-sm font-dm-sans border"
                  style={dark
                    ? { background: 'rgba(20,40,70,0.60)', borderColor: 'rgba(100,181,246,0.25)', color: '#90CAF9' }
                    : { background: 'rgba(225,242,254,0.75)', borderColor: 'rgba(100,181,246,0.40)', color: '#1565C0' }}>
                  {notice}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.97 }}
              className="w-full py-3.5 rounded-2xl font-dm-sans font-semibold text-white shadow-gold disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </motion.button>

            {/* Forgot password (login mode only) */}
            {mode === 'login' && (
              <div className="text-center -mt-2">
                <Link href="/forgot-password" className="font-dm-sans text-xs hover:underline" style={{ color: '#C9943A' }}>
                  Forgot password?
                </Link>
              </div>
            )}

            {/* Divider + Google OAuth */}
            {isOAuthConfigured() && (
              <>
                <div className="flex items-center gap-3 my-2">
                  <span className="flex-1 h-px" style={{ background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }} />
                  <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: sColor }}>or</span>
                  <span className="flex-1 h-px" style={{ background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }} />
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
                    // successful call redirects the browser away — nothing else to do
                  }}
                  disabled={loading}
                  className="w-full py-3 rounded-2xl font-dm-sans font-semibold text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                  style={{
                    background: dark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                    border:     `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'}`,
                    color:      dark ? '#F5EFE8' : '#3A2F28',
                  }}
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
          <p className="text-center font-dm-sans text-sm mt-6" style={{ color: sColor }}>
            {mode === 'login' ? (
              <>No account?{' '}
                <button type="button" onClick={() => switchMode('signup')} className="text-gold font-medium hover:underline">
                  Sign up free
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-gold font-medium hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </motion.div>

        <p className="text-center font-dm-sans text-xs mt-5" style={{ color: sColor }}>
          <Link href="/" className="hover:text-gold transition-colors">← Back to home</Link>
        </p>
      </motion.div>
    </div>
  );
}
