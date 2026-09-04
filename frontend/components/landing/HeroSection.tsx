'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import ScrollIndicator from './ScrollIndicator';

export default function HeroSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const { theme } = useTheme();
  const { user, loading } = useAuth();
  const dark = theme === 'dark';
  const authed = !loading && !!user;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-0 overflow-hidden">

      {/* Ambient blobs — tone-aware */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full animate-float"
          style={{ background: dark
            ? 'radial-gradient(circle,rgba(201,148,58,0.12) 0%,transparent 70%)'
            : 'radial-gradient(circle,rgba(214,233,248,0.55) 0%,transparent 70%)',
            filter: 'blur(60px)' }} />
        <div className="absolute -bottom-20 -right-20 w-[420px] h-[420px] rounded-full animate-float-slow"
          style={{ background: dark
            ? 'radial-gradient(circle,rgba(240,201,122,0.10) 0%,transparent 70%)'
            : 'radial-gradient(circle,rgba(253,223,196,0.60) 0%,transparent 70%)',
            filter: 'blur(55px)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full"
          style={{ background: dark
            ? 'radial-gradient(circle,rgba(201,148,58,0.08) 0%,transparent 65%)'
            : 'radial-gradient(circle,rgba(253,243,224,0.70) 0%,transparent 65%)',
            filter: 'blur(48px)' }} />
        {/* Subtle rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{ border: '1px solid rgba(201,148,58,0.10)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full"
          style={{ border: '1px solid rgba(201,148,58,0.07)' }} />
      </div>

      {/* Content */}
      <motion.div
        ref={ref}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="relative z-10 max-w-3xl mx-auto flex flex-col items-center"
      >
        {/* H1 */}
        <motion.h1
          variants={fadeUp}
          custom={0}
          className="font-serif leading-[1.08] tracking-tight"
          style={{
            fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
            color: dark ? '#F5EFE8' : '#3A2F28',
          }}
        >
          Welcome to{' '}
          <span style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            RecallPal
          </span>
        </motion.h1>

        {/* Sub-heading */}
        <motion.p
          variants={fadeUp}
          custom={1}
          className="font-dm-sans text-xl max-w-xl mx-auto leading-relaxed mt-5"
          style={{ color: dark ? '#C4B09A' : '#6B5C52' }}
        >
          Your friendly AI companion for helping you remember the people who matter most —
          with warmth, dignity, and care.
        </motion.p>

        {/* CTA buttons */}
        <motion.div variants={fadeUp} custom={2} className="flex flex-wrap gap-4 justify-center mt-10">
          {authed ? (
            <motion.div
              whileHover={{ scale: 1.05, boxShadow: '0 8px 30px rgba(201,148,58,0.45)' }}
              whileTap={{ scale: 0.97 }}>
              <Link href="/dashboard"
                className="font-dm-sans font-semibold text-white rounded-full px-8 py-4 text-lg shadow-gold inline-block transition-all duration-200"
                style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                Open Dashboard
              </Link>
            </motion.div>
          ) : (
            <>
              <motion.div
                whileHover={{ scale: 1.05, boxShadow: '0 8px 30px rgba(201,148,58,0.45)' }}
                whileTap={{ scale: 0.97 }}>
                <Link href="/register"
                  className="font-dm-sans font-semibold text-white rounded-full px-8 py-4 text-lg shadow-gold inline-block transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                  Register Now
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link href="/login"
                  className="font-dm-sans font-medium rounded-full px-8 py-4 text-lg shadow-warm-sm inline-block transition-all duration-200"
                  style={{
                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.70)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.80)'}`,
                    color: dark ? '#C4B09A' : '#6B5C52',
                  }}>
                  Already registered?{' '}
                  <span style={{ color: '#C9943A', fontWeight: 600 }}>Log in</span>
                </Link>
              </motion.div>
            </>
          )}
        </motion.div>

      </motion.div>

      {/* Scroll indicator */}
      <div className="absolute bottom-0 inset-x-0">
        <ScrollIndicator />
      </div>
    </section>
  );
}
