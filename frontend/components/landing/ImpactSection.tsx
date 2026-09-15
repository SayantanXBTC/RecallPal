'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';
import { Sparkles, Shield, Users } from 'lucide-react';

const PRINCIPLES = [
  {
    icon: <Sparkles size={18} strokeWidth={1.6} />,
    title: 'Gentle by default',
    body:  'No alarms, no clinical tone. Face cards fade in beside a person, never over them.',
  },
  {
    icon: <Shield size={18} strokeWidth={1.6} />,
    title: 'Private by design',
    body:  'Face data is stored only for the caregiver who enrolled it, and can be erased in a single click.',
  },
  {
    icon: <Users size={18} strokeWidth={1.6} />,
    title: 'Built with families',
    body:  'Every feature is shaped by real caregivers — the small kindnesses matter more than the flashy features.',
  },
];

export default function ImpactSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section
      id="impact"
      className="cinema-section px-6 relative overflow-hidden"
    >
      {/* Section ambient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(138,91,255,0.10) 0%, transparent 60%),' +
            'radial-gradient(ellipse 60% 40% at 20% 90%, rgba(91,108,255,0.08) 0%, transparent 55%)',
        }}
      />

      <div className="max-w-6xl mx-auto relative">

        {/* Header */}
        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center mb-20"
        >
          <motion.p variants={fadeUp} custom={0} className="eyebrow justify-center">
            What We Stand For
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="headline-editorial text-white mt-5 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Real Moments. Real Families.{' '}
            <span className="accent">Real Connection.</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="font-inter font-light text-lg max-w-2xl mx-auto mt-6 leading-relaxed text-white/60"
          >
            Technology should bring people closer together. Below are the promises we make
            to every family who invites RecallPal into their home.
          </motion.p>
        </motion.div>

        {/* Principles — glass strip */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid md:grid-cols-3 gap-4"
        >
          {PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.title}
              variants={scaleIn}
              whileHover={{ y: -4 }}
              className="liquid-glass rounded-3xl p-7 relative"
              style={{ marginTop: i === 1 ? '1.5rem' : 0 }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(91,108,255,0.20), rgba(138,91,255,0.10))',
                  color: '#C7D1FF',
                }}
              >
                {p.icon}
              </div>
              <h3 className="font-inter text-[1.05rem] font-medium text-white tracking-tight mb-2">
                {p.title}
              </h3>
              <p className="font-inter font-light text-[0.92rem] leading-relaxed text-white/60">
                {p.body}
              </p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
