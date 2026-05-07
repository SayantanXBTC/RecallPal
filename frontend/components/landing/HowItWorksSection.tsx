'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Camera, UserPlus, Mic, ArrowRight } from 'lucide-react';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';

const STEPS = [
  {
    step: '01',
    icon: <UserPlus size={24} />,
    iconBg: 'rgba(214,233,248,0.7)',
    iconColor: '#4A90D9',
    title: 'Add Your Loved Ones',
    desc: 'Capture 5–10 photos of each person you want RecallPal to remember. Our AI builds a secure, private face profile stored only for your account.',
  },
  {
    step: '02',
    icon: <Camera size={24} />,
    iconBg: 'rgba(253,243,224,0.7)',
    iconColor: '#C9943A',
    title: 'Point & Identify',
    desc: 'Open the dashboard and point the camera at anyone nearby. RecallPal recognises them in real time and shows their name, relation, and a warm memory note.',
  },
  {
    step: '03',
    icon: <Mic size={24} />,
    iconBg: 'rgba(253,220,225,0.7)',
    iconColor: '#D97B8A',
    title: 'Hear It Out Loud',
    desc: "A gentle voice reads the person's name and relationship aloud — giving the patient a moment of clarity and confidence without any confusion.",
  },
];

export default function HowItWorksSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  const { theme } = useTheme();
  const dark = theme === 'dark';

  const hColor     = dark ? '#F5EFE8' : '#3A2F28';
  const bColor     = dark ? '#C4B09A' : '#6B5C52';
  const cardBg     = dark ? 'rgba(52,41,24,0.82)' : 'rgba(255,255,255,0.58)';
  const ctaBg      = dark
    ? 'linear-gradient(135deg,rgba(70,52,22,0.92),rgba(58,44,16,0.85))'
    : 'linear-gradient(135deg,rgba(253,243,224,0.85),rgba(253,223,196,0.55))';
  const border     = dark ? 'rgba(201,148,58,0.22)' : 'rgba(255,255,255,0.70)';
  const iconBgDark = 'rgba(72,56,30,0.95)';

  return (
    <section id="how-it-works" className="py-28 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <motion.div ref={ref} variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'} className="text-center mb-20">
          <motion.p variants={fadeUp} custom={0}
            className="font-dm-sans text-sm font-semibold tracking-widest uppercase text-gold mb-3">
            How It Works
          </motion.p>
          <motion.h2 variants={fadeUp} custom={1}
            className="font-serif leading-snug"
            style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', color: hColor }}>
            Recognition in Three Simple Steps
          </motion.h2>
          <motion.p variants={fadeUp} custom={2}
            className="font-dm-sans text-lg max-w-2xl mx-auto mt-4 leading-relaxed"
            style={{ color: bColor }}>
            No technical knowledge required. RecallPal is designed for patients, caregivers,
            and families — anyone can set it up in minutes.
          </motion.p>
        </motion.div>

        {/* Steps */}
        <motion.div variants={staggerContainer} initial="hidden" animate={inView ? 'visible' : 'hidden'} className="grid md:grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <motion.div key={s.step} variants={scaleIn}
              className="relative rounded-3xl p-8 shadow-warm-md border flex flex-col"
              style={{ background: cardBg, backdropFilter: 'blur(16px)', borderColor: border }}>

              {/* Step number */}
              <span className="absolute top-6 right-7 font-serif text-5xl font-bold select-none"
                style={{ color: 'rgba(201,148,58,0.18)' }}>
                {s.step}
              </span>

              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shrink-0"
                style={{ background: dark ? iconBgDark : s.iconBg, color: s.iconColor }}>
                {s.icon}
              </div>

              <h3 className="font-serif text-xl mb-3" style={{ color: hColor }}>{s.title}</h3>
              <p className="font-dm-sans text-[0.95rem] leading-relaxed flex-1" style={{ color: bColor }}>{s.desc}</p>

              {/* Arrow connector */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10
                                w-8 h-8 rounded-full items-center justify-center shadow-warm-sm"
                  style={{ background: dark ? 'rgba(72,56,30,0.95)' : 'white', color: '#C9943A' }}>
                  <ArrowRight size={14} />
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* CTA banner */}
        <motion.div variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={4}
          className="mt-16 rounded-3xl p-10 text-center border border-gold/20 shadow-warm-lg"
          style={{ background: ctaBg, backdropFilter: 'blur(16px)' }}>
          <h3 className="font-serif text-2xl mb-3" style={{ color: hColor }}>Ready to get started?</h3>
          <p className="font-dm-sans text-lg max-w-xl mx-auto mb-7 leading-relaxed" style={{ color: bColor }}>
            Create a free account and add your first family member in under two minutes.
          </p>
          <motion.a href="/register"
            whileHover={{ scale: 1.05, boxShadow: '0 8px 30px rgba(201,148,58,0.45)' }}
            whileTap={{ scale: 0.97 }}
            className="inline-block font-dm-sans font-semibold text-white rounded-full px-8 py-3.5 text-base shadow-gold transition-all duration-200"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
            Get Started Free
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
