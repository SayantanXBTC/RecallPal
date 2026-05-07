'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Users, BookOpen, Bell, ArrowRight, Brain, Heart, Globe } from 'lucide-react';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';
import { useTheme } from '@/lib/theme-context';

const FEATURE_CARDS = [
  {
    icon: <Users size={22} />,
    iconBg: 'rgba(214,233,248,0.7)',
    iconColor: '#4A90D9',
    title: 'Face Recognition',
    desc: 'Instantly identify family members and caregivers with gentle AI-powered prompts.',
  },
  {
    icon: <BookOpen size={22} />,
    iconBg: 'rgba(253,223,196,0.7)',
    iconColor: '#C9943A',
    title: 'Memory Journal',
    desc: 'Revisit favourite conversations and life stories anytime, anywhere.',
  },
  {
    icon: <Bell size={22} />,
    iconBg: 'rgba(253,243,224,0.7)',
    iconColor: '#C9943A',
    title: 'Care Reminders',
    desc: 'Gentle daily reminders that feel warm and personal — not clinical.',
  },
];

const DEMENTIA_FACTS = [
  {
    icon: <Brain size={24} />,
    stat: '55M+',
    label: 'People live with dementia worldwide',
    color: '#4A90D9',
    bg: 'rgba(214,233,248,0.5)',
  },
  {
    icon: <Globe size={24} />,
    stat: '10M',
    label: 'New cases diagnosed every year',
    color: '#C9943A',
    bg: 'rgba(253,223,196,0.5)',
  },
  {
    icon: <Heart size={24} />,
    stat: '60%',
    label: 'Of patients lose the ability to recognise loved ones',
    color: '#D97B8A',
    bg: 'rgba(253,220,225,0.5)',
  },
];

export default function AboutSection() {
  const textRef  = useRef(null);
  const cardsRef = useRef(null);
  const factRef  = useRef(null);

  const textIn  = useInView(textRef,  { once: true, amount: 0.2 });
  const cardsIn = useInView(cardsRef, { once: true, amount: 0.2 });
  const factIn  = useInView(factRef,  { once: true, amount: 0.2 });

  const { theme } = useTheme();
  const dark = theme === 'dark';

  const hColor     = dark ? '#F5EFE8' : '#3A2F28';
  const bColor     = dark ? '#C4B09A' : '#6B5C52';
  const sColor     = dark ? '#A89880' : '#9A8C84';
  const cardBg     = dark ? 'rgba(52,41,24,0.82)' : 'rgba(255,255,255,0.55)';
  const sectionBg  = dark ? 'rgba(18,14,8,0.60)'  : 'rgba(255,255,255,0.35)';
  const solidCard  = dark ? 'rgba(52,41,24,0.82)'  : 'rgba(255,255,255,0.60)';
  const ctaBg      = dark
    ? 'linear-gradient(135deg,rgba(70,52,22,0.92),rgba(58,44,16,0.85))'
    : 'linear-gradient(135deg,rgba(253,243,224,0.85),rgba(253,223,196,0.55))';
  const border     = dark ? 'rgba(201,148,58,0.22)' : 'rgba(255,255,255,0.75)';
  const iconBgDark = 'rgba(72,56,30,0.95)';

  return (
    <>
      {/* ── ABOUT ──────────────────────────────────────────────────────────── */}
      <section id="about" className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-start">

          {/* Left — text */}
          <motion.div ref={textRef} variants={staggerContainer} initial="hidden" animate={textIn ? 'visible' : 'hidden'}>
            <motion.p variants={fadeUp} custom={0}
              className="font-dm-sans text-sm font-semibold tracking-widest uppercase text-gold">
              About RecallPal
            </motion.p>

            <motion.h2 variants={fadeUp} custom={1}
              className="font-serif mt-3 leading-snug"
              style={{ fontSize: 'clamp(2rem,3.5vw,3rem)', color: hColor }}>
              Hold On to the{' '}
              <span className="italic" style={{ color: '#C9943A' }}>Beauty</span>{' '}
              of Life
            </motion.h2>

            <motion.p variants={fadeUp} custom={2}
              className="font-dm-sans text-lg leading-relaxed mt-5"
              style={{ color: bColor }}>
              Memory loss doesn&apos;t have to mean losing the people you love. Life remains
              beautiful in every shared smile, every familiar voice, every cherished story —
              even when the details become harder to hold.
              <br /><br />
              RecallPal uses gentle, compassionate AI to help you recognise your loved ones,
              revisit meaningful conversations, and feel connected every single day. Because
              every moment of recognition is a moment of joy.
            </motion.p>

            <motion.button variants={fadeUp} custom={3}
              className="mt-6 inline-flex items-center gap-2 font-dm-sans font-semibold text-gold hover:gap-3 transition-all duration-200">
              Learn More <ArrowRight size={16} />
            </motion.button>
          </motion.div>

          {/* Right — feature cards */}
          <motion.div ref={cardsRef} variants={staggerContainer} initial="hidden" animate={cardsIn ? 'visible' : 'hidden'} className="flex flex-col gap-4">
            {FEATURE_CARDS.map((card) => (
              <motion.div key={card.title} variants={scaleIn}
                className="rounded-3xl p-6 shadow-warm-md border"
                style={{ background: cardBg, backdropFilter: 'blur(16px)', borderColor: border }}>
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl p-3 shrink-0"
                    style={{ background: dark ? iconBgDark : card.iconBg, color: card.iconColor }}>
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="font-serif text-lg" style={{ color: hColor }}>{card.title}</h3>
                    <p className="font-dm-sans text-sm mt-1 leading-relaxed" style={{ color: sColor }}>{card.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── DEMENTIA FACTS ─────────────────────────────────────────────────── */}
      <section id="dementia" className="py-24 px-6" style={{ background: sectionBg }}>
        <div className="max-w-6xl mx-auto">
          <motion.div ref={factRef} variants={staggerContainer} initial="hidden" animate={factIn ? 'visible' : 'hidden'} className="text-center mb-16">
            <motion.p variants={fadeUp} custom={0}
              className="font-dm-sans text-sm font-semibold tracking-widest uppercase text-gold mb-3">
              Understanding Dementia
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1}
              className="font-serif leading-snug"
              style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', color: hColor }}>
              A Global Challenge That Touches Every Family
            </motion.h2>
            <motion.p variants={fadeUp} custom={2}
              className="font-dm-sans text-lg max-w-2xl mx-auto mt-4 leading-relaxed"
              style={{ color: bColor }}>
              Dementia is not a normal part of ageing. It is a syndrome caused by brain disorders
              that affect memory, thinking, and the ability to recognise the people we love.
            </motion.p>
          </motion.div>

          {/* Stats row */}
          <motion.div variants={staggerContainer} initial="hidden" animate={factIn ? 'visible' : 'hidden'} className="grid md:grid-cols-3 gap-6 mb-16">
            {DEMENTIA_FACTS.map((f) => (
              <motion.div key={f.stat} variants={scaleIn}
                className="rounded-3xl p-8 text-center shadow-warm-md border"
                style={{ background: dark ? 'rgba(52,41,24,0.82)' : f.bg, backdropFilter: 'blur(12px)', borderColor: border }}>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
                  style={{ background: dark ? iconBgDark : 'white', color: f.color }}>
                  {f.icon}
                </div>
                <p className="font-serif text-4xl font-bold" style={{ color: hColor }}>{f.stat}</p>
                <p className="font-dm-sans text-sm mt-2 leading-relaxed" style={{ color: bColor }}>{f.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Causes & Effects */}
          <motion.div variants={staggerContainer} initial="hidden" animate={factIn ? 'visible' : 'hidden'} className="grid md:grid-cols-2 gap-8">
            {/* Causes */}
            <motion.div variants={scaleIn}
              className="rounded-3xl p-8 shadow-warm-md border"
              style={{ background: solidCard, backdropFilter: 'blur(16px)', borderColor: border }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: dark ? iconBgDark : 'rgba(214,233,248,0.8)', color: '#4A90D9' }}>
                <Brain size={20} />
              </div>
              <h3 className="font-serif text-xl mb-4" style={{ color: hColor }}>Causes</h3>
              <ul className="space-y-3 font-dm-sans text-[0.95rem] leading-relaxed" style={{ color: bColor }}>
                {[
                  "Alzheimer's disease — the most common cause, involving protein plaques that damage brain cells",
                  'Vascular dementia — reduced blood flow to the brain after strokes or vessel disease',
                  'Lewy body dementia — abnormal protein deposits disrupting nerve cell function',
                  'Frontotemporal dementia — damage to the frontal and temporal lobes affecting behaviour and language',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Effects on society */}
            <motion.div variants={scaleIn}
              className="rounded-3xl p-8 shadow-warm-md border"
              style={{ background: solidCard, backdropFilter: 'blur(16px)', borderColor: border }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: dark ? iconBgDark : 'rgba(253,223,196,0.8)', color: '#C9943A' }}>
                <Globe size={20} />
              </div>
              <h3 className="font-serif text-xl mb-4" style={{ color: hColor }}>Impact on Society</h3>
              <ul className="space-y-3 font-dm-sans text-[0.95rem] leading-relaxed" style={{ color: bColor }}>
                {[
                  '$1.3 trillion in annual global care costs — projected to double by 2030',
                  'Over 50 million unpaid family caregivers face emotional burnout and isolation',
                  'Patients lose independence years before physical decline, creating deep emotional strain',
                  'Healthcare systems are overwhelmed — 2 out of 3 patients live in low-income settings with little support',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>

          {/* How RecallPal helps */}
          <motion.div variants={fadeUp} initial="hidden" animate={factIn ? 'visible' : 'hidden'} custom={3}
            className="mt-8 rounded-3xl p-10 text-center shadow-warm-lg border border-gold/20"
            style={{ background: ctaBg, backdropFilter: 'blur(16px)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}>
              <Heart size={22} />
            </div>
            <h3 className="font-serif text-2xl mb-4" style={{ color: hColor }}>How RecallPal Helps</h3>
            <p className="font-dm-sans text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: bColor }}>
              RecallPal uses real-time face recognition and AI-powered memory cards to help patients
              identify the people around them — reducing anxiety, strengthening bonds, and giving
              caregivers a compassionate tool that works silently in the background. No complexity.
              Just connection.
            </p>
          </motion.div>
        </div>
      </section>
    </>
  );
}
