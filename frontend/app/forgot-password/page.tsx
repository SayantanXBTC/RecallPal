'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:       trimmed,
          redirect_to: `${window.location.origin}/reset-password`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not send reset email.');
        return;
      }
      setSent(true);
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

        <h1 className="font-serif text-3xl mb-2" style={{ color: '#3A2F28' }}>Forgot password?</h1>
        <p className="font-dm-sans text-sm mb-6" style={{ color: '#6B5C52' }}>
          Enter the email you signed up with. If we find an account, we&apos;ll send a secure reset link.
        </p>

        {sent ? (
          <div className="rounded-2xl p-4 mb-4"
            style={{ background: 'rgba(129,230,217,0.15)', border: '1px solid rgba(79,209,197,0.35)' }}>
            <p className="font-dm-sans text-sm" style={{ color: '#0f766e' }}>
              Check <span className="font-semibold">{email}</span> for a message from Supabase Auth. The link
              expires in 60 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-xs font-semibold tracking-wide uppercase mb-1"
                style={{ color: '#8A7D72' }}>Email</label>
              <input id="fp-email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>

            {error && (
              <p className="text-xs text-amber-600 font-dm-sans">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-full py-3 font-semibold text-white text-sm shadow-gold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
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
