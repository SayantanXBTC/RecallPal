'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { fadeUp, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';

export default function ImpactSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  const { theme } = useTheme();
  const dark = theme === 'dark';

  const hColor     = dark ? '#F5EFE8' : '#3A2F28';
  const bColor     = dark ? '#C4B09A' : '#6B5C52';
  const sectionBg  = dark ? 'rgba(18,14,8,0.60)'  : 'rgba(255,255,255,0.30)';

  return (
    <section id="impact" className="py-28 px-6" style={{ background: sectionBg }}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <motion.div ref={ref} variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'} className="text-center mb-20">
          <motion.p variants={fadeUp} custom={0}
            className="font-dm-sans text-sm font-semibold tracking-widest uppercase text-gold mb-3">
            Our Impact
          </motion.p>
          <motion.h2 variants={fadeUp} custom={1}
            className="font-serif leading-snug"
            style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', color: hColor }}>
            Real Moments. Real Families. Real Connection.
          </motion.h2>
          <motion.p variants={fadeUp} custom={2}
            className="font-dm-sans text-lg max-w-2xl mx-auto mt-4 leading-relaxed"
            style={{ color: bColor }}>
            Technology should bring people closer together. Every number below represents
            a family reunited — if only for a moment.
          </motion.p>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={3}
          className="text-center">
          <p className="font-dm-sans text-lg mb-6" style={{ color: bColor }}>
            Join thousands of families already using RecallPal.
          </p>
          <motion.a href="/register"
            whileHover={{ scale: 1.05, boxShadow: '0 8px 30px rgba(201,148,58,0.45)' }}
            whileTap={{ scale: 0.97 }}
            className="inline-block font-dm-sans font-semibold text-white rounded-full px-9 py-4 text-base shadow-gold transition-all duration-200"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
            Start for Free
          </motion.a>
        </motion.div>

      </div>
    </section>
  );
}
