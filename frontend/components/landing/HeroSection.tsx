'use client';

import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { useAuth } from '@/lib/auth-context';
import ScrollIndicator from './ScrollIndicator';

const AVATARS = [
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100',
  'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100',
  'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100',
  'https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=100',
];

/* Triangular dot pattern icon — 9 white/60 dots arranged as pyramid */
function TrianglePatternIcon() {
  const dots = [
    { top: 0,  left: 9  },
    { top: 5,  left: 5  },
    { top: 5,  left: 13 },
    { top: 10, left: 1  },
    { top: 10, left: 9  },
    { top: 10, left: 17 },
    { top: 15, left: 5  },
    { top: 15, left: 9  },
    { top: 15, left: 13 },
  ];
  return (
    <div className="relative w-5 h-5">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute bg-white/60"
          style={{ width: '2.5px', height: '2.5px', top: d.top, left: d.left }}
        />
      ))}
    </div>
  );
}

/* 3×3 checkerboard icon */
function CheckerboardIcon() {
  const pattern = [1, 0, 1, 0, 1, 0, 1, 0, 1];
  return (
    <div className="grid grid-cols-3 gap-[2px] w-5 h-5">
      {pattern.map((v, i) => (
        <span
          key={i}
          className={`w-1 h-1 rounded-[1px] ${v ? 'bg-white/60' : 'bg-white/0'}`}
        />
      ))}
    </div>
  );
}

export default function HeroSection() {
  const ref    = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const { user, loading } = useAuth();
  const authed = !loading && !!user;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yShift  = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.25]);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col overflow-hidden px-5 sm:px-8 md:px-16 lg:px-20 pt-24 md:pt-32 pb-10"
    >
      {/* Content — top block */}
      <motion.div
        style={{ y: yShift, opacity }}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="relative z-10 max-w-2xl flex-1 flex flex-col justify-center mt-14 sm:mt-20 md:mt-28"
      >
        {/* Badge — liquid glass pill with overlapping avatars */}
        <motion.div variants={fadeUp} custom={0}>
          <div className="liquid-glass rounded-full inline-flex items-center gap-2.5 sm:gap-3 px-3 py-1.5 sm:px-4 sm:py-2 mb-5 sm:mb-6">
            <div className="flex -space-x-2">
              {AVATARS.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white/20 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
            <span className="text-xs sm:text-sm font-light text-white/80 font-inter">
              A memory companion, reimagined
            </span>
          </div>
        </motion.div>

        {/* Heading — original RecallPal copy */}
        <motion.h1
          variants={fadeUp}
          custom={1}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] text-white font-inter"
          style={{ letterSpacing: '-0.05em' }}
        >
          Welcome to<br />
          <span className="accent">RecallPal</span>
        </motion.h1>

        {/* Subtitle — original copy */}
        <motion.p
          variants={fadeUp}
          custom={2}
          className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg font-light text-white/70 font-inter max-w-xl leading-relaxed"
        >
          Your friendly AI companion for helping you remember the people who matter most —
          with warmth, dignity, and care.
        </motion.p>

        {/* CTAs — original wording preserved */}
        <motion.div variants={fadeUp} custom={3} className="mt-6 sm:mt-8 flex flex-wrap gap-3">
          {authed ? (
            <Link
              href="/dashboard"
              className="liquid-glass rounded-full px-6 py-3 sm:px-7 sm:py-3.5 text-sm font-medium text-white font-inter transition duration-300 hover:bg-white/10"
            >
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="liquid-glass rounded-full px-6 py-3 sm:px-7 sm:py-3.5 text-sm font-medium text-white font-inter transition duration-300 hover:bg-white/10"
              >
                Register Now
              </Link>
              <Link
                href="/login"
                className="liquid-glass rounded-full px-6 py-3 sm:px-7 sm:py-3.5 text-sm font-medium text-white/80 font-inter transition duration-300 hover:bg-white/10 hover:text-white"
              >
                Already registered? <span className="text-[#C7D1FF] ml-1">Log in</span>
              </Link>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Bottom stats — uses text from original landing (HowItWorks step 1 + Recognition in 3 steps) */}
      <motion.div
        style={{ opacity }}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="relative z-10 flex items-end gap-6 sm:gap-10 md:gap-16 mt-10"
      >
        <motion.div variants={fadeUp} custom={5} className="flex flex-col gap-2">
          <TrianglePatternIcon />
          <div className="text-xl sm:text-2xl md:text-3xl font-normal text-white font-inter" style={{ letterSpacing: '-0.03em' }}>
            5–10 Photos
          </div>
          <div className="text-xs sm:text-sm font-light text-white/60 font-inter">
            Per Loved One
          </div>
        </motion.div>

        <motion.div variants={fadeUp} custom={6} className="flex flex-col gap-2">
          <CheckerboardIcon />
          <div className="text-xl sm:text-2xl md:text-3xl font-normal text-white font-inter" style={{ letterSpacing: '-0.03em' }}>
            Three Steps
          </div>
          <div className="text-xs sm:text-sm font-light text-white/60 font-inter">
            To Recognition
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <div className="absolute bottom-4 right-6 md:right-16 lg:right-20 z-10">
        <ScrollIndicator />
      </div>

      {/* Bottom fade into next section */}
      <div
        className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent, rgba(5,7,12,0.85))',
        }}
      />
    </section>
  );
}
