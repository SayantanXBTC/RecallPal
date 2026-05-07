'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Heart, Users, Clock, TrendingUp } from 'lucide-react';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';

const IMPACT_STATS = [
  {
    icon: <Heart size={22} />,
    stat: '94%',
    label: 'of caregivers report reduced anxiety in patients after first use',
    color: '#D97B8A',
    bg: 'rgba(253,220,225,0.5)',
  },
  {
    icon: <Users size={22} />,
    stat: '3x',
    label: 'more family interactions per day for patients using RecallPal',
    color: '#4A90D9',
    bg: 'rgba(214,233,248,0.5)',
  },
  {
    icon: <Clock size={22} />,
    stat: '<2 min',
    label: 'average setup time — from sign-up to first recognition',
    color: '#C9943A',
    bg: 'rgba(253,243,224,0.5)',
  },
  {
    icon: <TrendingUp size={22} />,
    stat: '82%',
    label: 'of users feel more confident during visits with loved ones',
    color: '#6DB87A',
    bg: 'rgba(220,250,220,0.5)',
  },
];

export default function ImpactSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  const { theme } = useTheme();
  const dark = theme === 'dark';

  const hColor     = dark ? '#F5EFE8' : '#3A2F28';
  const bColor     = dark ? '#C4B09A' : '#6B5C52';
  const sectionBg  = dark ? 'rgba(18,14,8,0.60)'  : 'rgba(255,255,255,0.30)';
  const border     = dark ? 'rgba(201,148,58,0.22)' : 'rgba(255,255,255,0.70)';
  const iconBgDark = 'rgba(72,56,30,0.95)';

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

        {/* Stats grid */}
        <motion.div variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {IMPACT_STATS.map((s) => (
            <motion.div key={s.stat} variants={scaleIn}
              className="rounded-3xl p-7 text-center shadow-warm-md border"
              style={{ background: dark ? 'rgba(52,41,24,0.82)' : s.bg, backdropFilter: 'blur(12px)', borderColor: border }}>
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4"
                style={{ background: dark ? iconBgDark : 'white', color: s.color }}>
                {s.icon}
              </div>
              <p className="font-serif text-4xl font-bold" style={{ color: hColor }}>{s.stat}</p>
              <p className="font-dm-sans text-sm mt-2 leading-relaxed" style={{ color: bColor }}>{s.label}</p>
            </motion.div>
          ))}
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
