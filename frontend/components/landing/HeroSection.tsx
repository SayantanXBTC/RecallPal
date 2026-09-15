'use client';

import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { Sparkles, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { useAuth } from '@/lib/auth-context';
import ScrollIndicator from './ScrollIndicator';

export default function HeroSection() {
  const ref    = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const { user, loading } = useAuth();
  const authed = !loading && !!user;

  // Parallax on scroll
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yShift  = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.3]);
  const blur    = useTransform(scrollYProgress, [0, 1], ['blur(0px)', 'blur(6px)']);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-36 pb-24 overflow-hidden"
    >
      {/* Cinematic ambient */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Center glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full animate-drift-slow"
          style={{
            background: 'radial-gradient(circle, rgba(91,108,255,0.16) 0%, transparent 60%)',
            filter:     'blur(60px)',
          }}
        />
        {/* Concentric rings */}
        {[720, 540, 380].map((size, i) => (
          <div
            key={size}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width:  `${size}px`,
              height: `${size}px`,
              border: `1px solid rgba(138,160,255,${0.06 + i * 0.02})`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        style={{ y: yShift, opacity, filter: blur }}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="relative z-10 max-w-4xl mx-auto flex flex-col items-center"
      >
        {/* Eyebrow — liquid glass pill */}
        <motion.div variants={fadeUp} custom={0}>
          <div className="liquid-glass rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8AA0FF] shadow-[0_0_10px_rgba(138,160,255,0.9)]" />
            <span className="font-inter text-[0.72rem] font-medium tracking-[0.22em] uppercase text-white/80">
              A memory companion, reimagined
            </span>
          </div>
        </motion.div>

        {/* H1 — cinematic editorial */}
        <motion.h1
          variants={fadeUp}
          custom={1}
          className="headline-editorial text-white"
          style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
        >
          Welcome to
          <br />
          <span className="accent">RecallPal</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          variants={fadeUp}
          custom={2}
          className="font-inter font-light text-lg md:text-xl max-w-xl mx-auto leading-relaxed mt-8 text-white/65"
          style={{ letterSpacing: '-0.005em' }}
        >
          Your friendly AI companion for helping you remember the people who matter most —
          with warmth, dignity, and care.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={fadeUp} custom={3} className="flex flex-wrap gap-3 justify-center mt-10">
          {authed ? (
            <Link href="/dashboard" className="glass-btn glass-btn-primary">
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link href="/register" className="glass-btn glass-btn-primary">
                Register Now
              </Link>
              <Link href="/login" className="glass-btn">
                Already registered? <span className="text-[#8AA0FF]">Log in</span>
              </Link>
            </>
          )}
        </motion.div>

        {/* Floating glass trust chips */}
        <motion.div
          variants={fadeUp}
          custom={4}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl"
        >
          {[
            { icon: <Sparkles size={14} strokeWidth={1.6} />, label: 'Gentle by default' },
            { icon: <ShieldCheck size={14} strokeWidth={1.6} />, label: 'Private by design' },
            { icon: <UsersIcon size={14} strokeWidth={1.6} />, label: 'Built with families' },
          ].map((chip, i) => (
            <motion.div
              key={chip.label}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.9 + i * 0.1, duration: 0.6 }}
              className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-2.5 justify-center"
            >
              <span className="text-[#8AA0FF]">{chip.icon}</span>
              <span className="font-inter text-[0.82rem] font-medium text-white/75">
                {chip.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 inset-x-0">
        <ScrollIndicator />
      </div>

      {/* Bottom fade into next section */}
      <div
        className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent, rgba(5,7,12,0.7))',
        }}
      />
    </section>
  );
}
