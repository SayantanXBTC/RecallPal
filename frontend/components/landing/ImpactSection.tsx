'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';
import { Sparkles, Shield, Users, Quote } from 'lucide-react';

const PRINCIPLES = [
  {
    icon: <Sparkles size={20} />,
    title: 'Gentle by default',
    body:  'No alarms, no clinical tone. Face cards fade in beside a person, never over them.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Private by design',
    body:  'Face data is stored only for the caregiver who enrolled it, and can be erased in a single click.',
  },
  {
    icon: <Users size={20} />,
    title: 'Built with families',
    body:  'Every feature is shaped by real caregivers — the small kindnesses matter more than the flashy features.',
  },
];

const VOICES = [
  {
    quote: 'My mother stopped asking who I was mid-sentence. That is the whole gift.',
    who:   'Daughter, primary caregiver',
  },
  {
    quote: 'I used to dread visits. Now she greets me by name before I sit down.',
    who:   'Grandson, weekly visitor',
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
  const cardBg     = dark ? 'rgba(52,41,24,0.82)' : 'rgba(255,255,255,0.65)';
  const border     = dark ? 'rgba(201,148,58,0.22)' : 'rgba(255,255,255,0.75)';
  const iconBgDark = 'rgba(72,56,30,0.95)';

  return (
    <section id="impact" className="py-28 px-6" style={{ background: sectionBg }}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <motion.div ref={ref} variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'} className="text-center mb-16">
          <motion.p variants={fadeUp} custom={0}
            className="font-dm-sans text-sm font-semibold tracking-widest uppercase text-gold mb-3">
            What We Stand For
          </motion.p>
          <motion.h2 variants={fadeUp} custom={1}
            className="font-serif leading-snug"
            style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', color: hColor }}>
            Real Moments. Real Families. Real Connection.
          </motion.h2>
          <motion.p variants={fadeUp} custom={2}
            className="font-dm-sans text-lg max-w-2xl mx-auto mt-4 leading-relaxed"
            style={{ color: bColor }}>
            Technology should bring people closer together. Below are the promises we make
            to every family who invites RecallPal into their home.
          </motion.p>
        </motion.div>

        {/* Principles */}
        <motion.div variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="grid md:grid-cols-3 gap-6 mb-16">
          {PRINCIPLES.map((p) => (
            <motion.div key={p.title} variants={scaleIn}
              className="rounded-3xl p-7 shadow-warm-md border"
              style={{ background: cardBg, backdropFilter: 'blur(14px)', borderColor: border }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: dark ? iconBgDark : 'rgba(253,243,224,0.85)', color: '#C9943A' }}>
                {p.icon}
              </div>
              <h3 className="font-serif text-lg mb-2" style={{ color: hColor }}>{p.title}</h3>
              <p className="font-dm-sans text-sm leading-relaxed" style={{ color: bColor }}>{p.body}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Voices from families */}
        <motion.div variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="grid md:grid-cols-2 gap-6 mb-16">
          {VOICES.map((v) => (
            <motion.blockquote key={v.who} variants={scaleIn}
              className="rounded-3xl p-8 shadow-warm-md border relative"
              style={{ background: cardBg, backdropFilter: 'blur(14px)', borderColor: border }}>
              <Quote size={22} className="absolute top-5 right-5 opacity-30" color="#C9943A" />
              <p className="font-serif italic text-lg leading-relaxed" style={{ color: hColor }}>
                &ldquo;{v.quote}&rdquo;
              </p>
              <footer className="font-dm-sans text-xs mt-4 tracking-wide uppercase" style={{ color: '#C9943A' }}>
                — {v.who}
              </footer>
            </motion.blockquote>
          ))}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={3}
          className="text-center">
          <p className="font-dm-sans text-lg mb-6" style={{ color: bColor }}>
            Bring RecallPal into your family&apos;s daily rhythm.
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
