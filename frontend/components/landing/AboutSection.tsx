'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Users, BookOpen, Bell, ArrowRight, Brain, Heart, Globe } from 'lucide-react';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';

const FEATURE_CARDS = [
  {
    icon: <Users size={18} strokeWidth={1.6} />,
    title: 'Face Recognition',
    desc: 'Instantly identify family members and caregivers with gentle AI-powered prompts.',
  },
  {
    icon: <BookOpen size={18} strokeWidth={1.6} />,
    title: 'Memory Journal',
    desc: 'Revisit favourite conversations and life stories anytime, anywhere.',
  },
  {
    icon: <Bell size={18} strokeWidth={1.6} />,
    title: 'Care Reminders',
    desc: 'Gentle daily reminders that feel warm and personal — not clinical.',
  },
];

export default function AboutSection() {
  const textRef  = useRef(null);
  const cardsRef = useRef(null);
  const factRef  = useRef(null);

  const textIn  = useInView(textRef,  { once: true, amount: 0.2 });
  const cardsIn = useInView(cardsRef, { once: true, amount: 0.2 });
  const factIn  = useInView(factRef,  { once: true, amount: 0.15 });

  return (
    <>
      {/* ── ABOUT ──────────────────────────────────────────────────────────── */}
      <section id="about" className="cinema-section px-6 relative">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-start">

          {/* Left — text */}
          <motion.div ref={textRef} variants={staggerContainer} initial="hidden" animate={textIn ? 'visible' : 'hidden'}>
            <motion.p variants={fadeUp} custom={0} className="eyebrow">
              About RecallPal
            </motion.p>

            <motion.h2
              variants={fadeUp}
              custom={1}
              className="headline-editorial text-white mt-5"
              style={{ fontSize: 'clamp(2.2rem, 4.4vw, 4rem)' }}
            >
              Hold On to the{' '}
              <span className="accent">Beauty</span>{' '}
              of Life
            </motion.h2>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="font-inter font-light text-[1.05rem] leading-relaxed mt-6 text-white/65"
            >
              Memory loss doesn&apos;t have to mean losing the people you love. Life remains
              beautiful in every shared smile, every familiar voice, every cherished story —
              even when the details become harder to hold.
              <br /><br />
              RecallPal uses gentle, compassionate AI to help you recognise your loved ones,
              revisit meaningful conversations, and feel connected every single day. Because
              every moment of recognition is a moment of joy.
            </motion.p>

            <motion.button
              variants={fadeUp}
              custom={3}
              className="mt-8 inline-flex items-center gap-2 font-inter font-medium text-[0.9rem] text-white/85 hover:text-white transition-colors group"
            >
              <span>Learn More</span>
              <ArrowRight size={15} strokeWidth={1.6} className="transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.div>

          {/* Right — feature cards */}
          <motion.div
            ref={cardsRef}
            variants={staggerContainer}
            initial="hidden"
            animate={cardsIn ? 'visible' : 'hidden'}
            className="flex flex-col gap-4"
          >
            {FEATURE_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                variants={scaleIn}
                whileHover={{ y: -3, transition: { duration: 0.3 } }}
                className={`liquid-glass ${i % 2 === 0 ? 'liquid-glass-tinted' : ''} rounded-3xl p-6`}
                style={{ marginLeft: i === 1 ? '2rem' : 0 }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="rounded-2xl w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, rgba(91,108,255,0.20), rgba(138,91,255,0.12))',
                      color: '#C7D1FF',
                      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.10)',
                    }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="font-inter text-[1.05rem] font-medium text-white tracking-tight">
                      {card.title}
                    </h3>
                    <p className="font-inter font-light text-sm mt-1.5 leading-relaxed text-white/60">
                      {card.desc}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Horizon divider */}
      <div className="max-w-4xl mx-auto px-6"><div className="horizon-line" /></div>

      {/* ── DEMENTIA FACTS ─────────────────────────────────────────────────── */}
      <section id="dementia" className="cinema-section px-6 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div
            ref={factRef}
            variants={staggerContainer}
            initial="hidden"
            animate={factIn ? 'visible' : 'hidden'}
            className="text-center mb-20"
          >
            <motion.p variants={fadeUp} custom={0} className="eyebrow justify-center">
              Understanding Dementia
            </motion.p>

            <motion.h2
              variants={fadeUp}
              custom={1}
              className="headline-editorial text-white mt-5 max-w-3xl mx-auto"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              A Global Challenge That Touches{' '}
              <span className="accent">Every Family</span>
            </motion.h2>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="font-inter font-light text-lg max-w-2xl mx-auto mt-6 leading-relaxed text-white/60"
            >
              Dementia is not a normal part of ageing. It is a syndrome caused by brain disorders
              that affect memory, thinking, and the ability to recognise the people we love.
            </motion.p>
          </motion.div>

          {/* Who it helps — three glass tiles */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate={factIn ? 'visible' : 'hidden'}
            className="grid md:grid-cols-3 gap-5 mb-16"
          >
            {[
              {
                icon: <Users size={18} strokeWidth={1.6} />,
                title: 'For families',
                body:  'A quiet second pair of eyes at the kitchen table — softening moments of blank recognition into shared smiles.',
              },
              {
                icon: <Heart size={18} strokeWidth={1.6} />,
                title: 'For patients',
                body:  'Independence held a little longer. Faces stay familiar; conversation stays possible; dignity stays intact.',
              },
              {
                icon: <Brain size={18} strokeWidth={1.6} />,
                title: 'For caregivers',
                body:  'Fewer painful reintroductions. More time being present, less time bridging the gap alone.',
              },
            ].map((tile, i) => (
              <motion.div
                key={tile.title}
                variants={scaleIn}
                whileHover={{ y: -4 }}
                className="liquid-glass rounded-3xl p-7 relative"
                style={{ marginTop: i === 1 ? '2rem' : 0 }}
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(91,108,255,0.18), rgba(138,91,255,0.10))',
                    color: '#C7D1FF',
                  }}
                >
                  {tile.icon}
                </div>
                <h3 className="font-inter text-[1.1rem] font-medium text-white tracking-tight mb-2">
                  {tile.title}
                </h3>
                <p className="font-inter font-light text-[0.92rem] leading-relaxed text-white/60">
                  {tile.body}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Causes & Effects — 2 columns */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate={factIn ? 'visible' : 'hidden'}
            className="grid md:grid-cols-2 gap-6"
          >
            {/* Causes */}
            <motion.div variants={scaleIn} className="liquid-glass rounded-3xl p-8">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(107,201,255,0.18), rgba(91,108,255,0.10))',
                  color: '#BEE0FF',
                }}
              >
                <Brain size={18} strokeWidth={1.6} />
              </div>
              <h3 className="font-inter text-xl font-medium text-white tracking-tight mb-5">
                Causes
              </h3>
              <ul className="space-y-3.5 font-inter font-light text-[0.94rem] leading-relaxed text-white/65">
                {[
                  "Alzheimer's disease — the most common cause, involving protein plaques that damage brain cells",
                  'Vascular dementia — reduced blood flow to the brain after strokes or vessel disease',
                  'Lewy body dementia — abnormal protein deposits disrupting nerve cell function',
                  'Frontotemporal dementia — damage to the frontal and temporal lobes affecting behaviour and language',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-2 w-1 h-1 rounded-full shrink-0"
                      style={{ background: '#8AA0FF', boxShadow: '0 0 8px rgba(138,160,255,0.6)' }}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Effects on society */}
            <motion.div variants={scaleIn} className="liquid-glass rounded-3xl p-8">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(138,91,255,0.18), rgba(91,108,255,0.10))',
                  color: '#D0BFFF',
                }}
              >
                <Globe size={18} strokeWidth={1.6} />
              </div>
              <h3 className="font-inter text-xl font-medium text-white tracking-tight mb-5">
                Impact on Society
              </h3>
              <ul className="space-y-3.5 font-inter font-light text-[0.94rem] leading-relaxed text-white/65">
                {[
                  '$1.3 trillion in annual global care costs — projected to double by 2030',
                  'Over 50 million unpaid family caregivers face emotional burnout and isolation',
                  'Patients lose independence years before physical decline, creating deep emotional strain',
                  'Healthcare systems are overwhelmed — 2 out of 3 patients live in low-income settings with little support',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-2 w-1 h-1 rounded-full shrink-0"
                      style={{ background: '#C7B4FF', boxShadow: '0 0 8px rgba(199,180,255,0.6)' }}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>

          {/* How RecallPal helps — hero glass panel */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate={factIn ? 'visible' : 'hidden'}
            custom={3}
            className="mt-10 liquid-glass liquid-glass-tinted rounded-[2rem] p-10 md:p-14 text-center relative overflow-hidden"
          >
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(91,108,255,0.20) 0%, transparent 65%)',
                filter: 'blur(60px)',
              }}
            />
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-6 relative z-10"
              style={{
                background: 'linear-gradient(135deg, #E8ECFF, #C7D1FF)',
                color: '#0A0C10',
                boxShadow: '0 10px 30px -8px rgba(91,108,255,0.55)',
              }}
            >
              <Heart size={20} strokeWidth={1.6} />
            </div>
            <h3
              className="headline-editorial text-white mb-5 relative z-10"
              style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)' }}
            >
              How RecallPal Helps
            </h3>
            <p className="font-inter font-light text-[1.05rem] max-w-2xl mx-auto leading-relaxed text-white/70 relative z-10">
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
