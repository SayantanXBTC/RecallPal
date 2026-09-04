'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import Avatar from '@/components/Avatar';

const NAV_LINKS = [
  { label: 'About',       href: '#about' },
  { label: 'How It Works',href: '#how-it-works' },
  { label: 'Dementia',    href: '#dementia' },
  { label: 'Impact',      href: '#impact' },
];

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading, refreshProfile } = useAuth();
  const [open,     setOpen]     = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dark = theme === 'dark';
  const authed = !loading && !!user;

  // If a returning user was persisted before avatar/display_name were
  // captured (older localStorage schema, or hydrateSession w/o metadata),
  // fetch the enriched profile once so the header shows their real photo.
  useEffect(() => {
    if (authed && user && !user.avatar_url && !user.display_name) {
      void refreshProfile();
    }
  }, [authed, user, refreshProfile]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const scrollTo = (href: string) => {
    setOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navBg = scrolled
    ? dark
      ? 'backdrop-blur-glass bg-black/50 border-b border-white/10 shadow-warm-sm'
      : 'backdrop-blur-glass bg-white/80 border-b border-white/70 shadow-warm-sm'
    : 'bg-transparent';

  return (
    <nav role="navigation" aria-label="Main navigation"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${navBg}`}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 select-none">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', boxShadow: '0 2px 10px rgba(201,148,58,0.35)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6z"/>
              <polyline points="9 3 9 9 15 9"/>
              <line x1="12" y1="13" x2="12" y2="17"/>
              <line x1="10" y1="15" x2="14" y2="15"/>
            </svg>
          </span>
          <span className="font-serif text-xl font-bold"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            RecallPal
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.href)}
              className="relative font-dm-sans text-[0.9rem] transition-colors duration-200 group pb-0.5 cursor-pointer"
              style={{ color: dark ? 'rgba(196,176,154,0.9)' : '#6B5C52' }}>
              {l.label}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] rounded-full group-hover:w-full transition-all duration-300"
                style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }} />
            </button>
          ))}
        </div>

        {/* Desktop right — dark mode + auth */}
        <div className="hidden md:flex items-center gap-3">

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/50"
            style={{ background: dark ? 'linear-gradient(135deg,#C9943A,#F0C97A)' : 'rgba(0,0,0,0.12)' }}
          >
            {/* Track icons */}
            <span className="absolute left-1 top-1/2 -translate-y-1/2 transition-opacity duration-300"
              style={{ opacity: dark ? 0 : 1 }}>
              <Sun size={11} color="#9A8C84" />
            </span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 transition-opacity duration-300"
              style={{ opacity: dark ? 1 : 0 }}>
              <Moon size={11} color="white" />
            </span>
            {/* Thumb */}
            <motion.span
              className="absolute top-0.5 w-5 h-5 rounded-full shadow-sm flex items-center justify-center"
              animate={{ x: dark ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{ background: dark ? 'white' : '#FAF6F1', border: dark ? 'none' : '1px solid rgba(0,0,0,0.08)' }}
            />
          </button>

          {authed ? (
            <>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Link href="/dashboard"
                  className="font-dm-sans text-sm font-semibold text-white rounded-full px-5 py-2.5 shadow-gold transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                  Open Dashboard
                </Link>
              </motion.div>
              <Link href="/settings" title={user?.display_name || user?.email || 'Profile'}
                className="shrink-0 hover:scale-105 transition-transform">
                <Avatar src={user?.avatar_url} name={user?.display_name || user?.email} size={34} ring />
              </Link>
            </>
          ) : (
            <>
              <Link href="/login"
                className="font-dm-sans text-[0.88rem] font-medium px-2 transition-colors duration-200 cursor-pointer"
                style={{ color: dark ? '#C4B09A' : '#6B5C52' }}>
                Log In
              </Link>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <Link href="/register"
                  className="font-dm-sans text-sm font-semibold text-white rounded-full px-5 py-2.5 shadow-gold transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                  Get Started
                </Link>
              </motion.div>
            </>
          )}
        </div>

        {/* Mobile: dark toggle + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <button onClick={toggleTheme} aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors cursor-pointer"
            style={{ color: dark ? '#C4B09A' : '#6B5C52' }}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer"
            style={{ color: dark ? '#C4B09A' : '#6B5C52' }}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
            className="overflow-hidden md:hidden border-t"
            style={{ background: dark ? 'rgba(18,14,9,0.92)' : 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
          >
            <div className="flex flex-col px-6 py-4 gap-4">
              {NAV_LINKS.map((l) => (
                <button key={l.label} onClick={() => scrollTo(l.href)}
                  className="text-left font-dm-sans transition-colors py-1 cursor-pointer"
                  style={{ color: dark ? '#C4B09A' : '#6B5C52' }}>
                  {l.label}
                </button>
              ))}
              <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                {authed ? (
                  <Link href="/dashboard"
                    className="text-center font-dm-sans text-sm font-semibold text-white py-2.5 rounded-full shadow-gold"
                    style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                    Open Dashboard
                  </Link>
                ) : (
                  <>
                    <Link href="/login" className="text-center font-dm-sans text-sm font-medium py-2.5 rounded-full border transition-all"
                      style={{ color: dark ? '#C4B09A' : '#6B5C52', borderColor: dark ? 'rgba(201,148,58,0.35)' : 'rgba(0,0,0,0.12)' }}>
                      Log In
                    </Link>
                    <Link href="/register"
                      className="text-center font-dm-sans text-sm font-semibold text-white py-2.5 rounded-full shadow-gold"
                      style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
