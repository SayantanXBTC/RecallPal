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

  return (
    <>
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="fixed top-4 md:top-6 inset-x-0 z-50 px-4 md:px-6 pointer-events-none"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 pointer-events-auto">

          {/* Logo — liquid glass chip */}
          <Link
            href="/"
            className={`liquid-glass rounded-full pl-2 pr-4 py-2 flex items-center gap-2.5 select-none transition-all duration-500 ${
              scrolled ? 'liquid-glass-strong' : ''
            }`}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(232,236,255,0.95), rgba(199,209,255,0.85))',
                boxShadow:  '0 4px 14px rgba(91,108,255,0.35), inset 0 1px 1px rgba(255,255,255,0.6)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0C10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6z"/>
                <polyline points="9 3 9 9 15 9"/>
                <line x1="12" y1="13" x2="12" y2="17"/>
                <line x1="10" y1="15" x2="14" y2="15"/>
              </svg>
            </span>
            <span
              className="font-inter text-[0.95rem] tracking-tight text-white/95"
              style={{ fontWeight: 500 }}
            >
              RecallPal
            </span>
          </Link>

          {/* Desktop nav — floating pill */}
          <div className="hidden md:flex liquid-glass liquid-glass-strong rounded-full px-2 py-1.5 items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.href)}
                className="relative font-inter text-[0.82rem] font-medium text-white/70 hover:text-white transition-colors duration-300 px-4 py-2 rounded-full cursor-pointer"
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Desktop right — theme + auth */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="liquid-glass w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors duration-300 cursor-pointer"
            >
              {dark ? <Sun size={15} strokeWidth={1.6} /> : <Moon size={15} strokeWidth={1.6} />}
            </button>

            {authed ? (
              <>
                <Link
                  href="/dashboard"
                  className="glass-btn glass-btn-primary text-[0.82rem]"
                  style={{ padding: '0.55rem 1.15rem' }}
                >
                  Open Dashboard
                </Link>
                <Link
                  href="/settings?from=home"
                  title={user?.display_name || user?.email || 'Profile'}
                  className="shrink-0 hover:scale-105 transition-transform"
                >
                  <Avatar src={user?.avatar_url} name={user?.display_name || user?.email} size={34} ring />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="font-inter text-[0.82rem] font-medium text-white/75 hover:text-white transition-colors duration-300 px-3"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="glass-btn glass-btn-primary text-[0.82rem]"
                  style={{ padding: '0.55rem 1.15rem' }}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="liquid-glass w-10 h-10 rounded-full flex items-center justify-center text-white/70"
            >
              {dark ? <Sun size={16} strokeWidth={1.6} /> : <Moon size={16} strokeWidth={1.6} />}
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="liquid-glass w-10 h-10 rounded-full flex items-center justify-center text-white/80 cursor-pointer"
            >
              <AnimatePresence mode="wait" initial={false}>
                {open ? (
                  <motion.span
                    key="x"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <X size={17} strokeWidth={1.7} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="m"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Menu size={17} strokeWidth={1.7} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile fullscreen glass overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="fixed inset-0 z-40 md:hidden"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(91,108,255,0.18) 0%, transparent 60%),' +
                'linear-gradient(180deg, rgba(5,7,12,0.95), rgba(5,7,12,0.98))',
              backdropFilter: 'blur(28px) saturate(160%)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ delay: 0.08, duration: 0.4 }}
              className="h-full flex flex-col items-center justify-center px-8 gap-2"
            >
              {NAV_LINKS.map((l, i) => (
                <motion.button
                  key={l.label}
                  onClick={() => scrollTo(l.href)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.06, duration: 0.4 }}
                  className="font-inter text-3xl font-light text-white/85 hover:text-white tracking-tight py-3 transition-colors"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {l.label}
                </motion.button>
              ))}

              <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
                {authed ? (
                  <Link href="/dashboard" className="glass-btn glass-btn-primary w-full justify-center">
                    Open Dashboard
                  </Link>
                ) : (
                  <>
                    <Link href="/login" className="glass-btn w-full justify-center">
                      Log In
                    </Link>
                    <Link href="/register" className="glass-btn glass-btn-primary w-full justify-center">
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
