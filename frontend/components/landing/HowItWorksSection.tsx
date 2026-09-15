'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Camera, UserPlus, Mic } from 'lucide-react';
import { fadeUp, scaleIn, staggerContainer } from '@/lib/variants';

const STEPS = [
  {
    step: '01',
    icon: <UserPlus size={20} strokeWidth={1.6} />,
    title: 'Add Your Loved Ones',
    desc: 'Capture 5–10 photos of each person you want RecallPal to remember. Our AI builds a secure, private face profile stored only for your account.',
  },
  {
    step: '02',
    icon: <Camera size={20} strokeWidth={1.6} />,
    title: 'Point & Identify',
    desc: 'Open the dashboard and point the camera at anyone nearby. RecallPal recognises them in real time and shows their name, relation, and a warm memory note.',
  },
  {
    step: '03',
    icon: <Mic size={20} strokeWidth={1.6} />,
    title: 'Hear It Out Loud',
    desc: "A gentle voice reads the person's name and relationship aloud — giving the patient a moment of clarity and confidence without any confusion.",
  },
];

export default function HowItWorksSection() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section id="how-it-works" className="cinema-section px-6 relative">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center mb-20"
        >
          <motion.p variants={fadeUp} custom={0} className="eyebrow justify-center">
            How It Works
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="headline-editorial text-white mt-5 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Recognition in{' '}
            <span className="accent">Three Simple Steps</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="font-inter font-light text-lg max-w-2xl mx-auto mt-6 leading-relaxed text-white/60"
          >
            No technical knowledge required. RecallPal is designed for patients, caregivers,
            and families — anyone can set it up in minutes.
          </motion.p>
        </motion.div>

        {/* Steps — offset staircase layout */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid md:grid-cols-3 gap-6 relative"
        >
          {/* Connecting line (desktop) */}
          <div
            className="hidden md:block absolute top-24 left-[16.66%] right-[16.66%] h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(138,160,255,0.35) 30%, rgba(138,160,255,0.35) 70%, transparent)',
            }}
          />

          {STEPS.map((s, i) => (
            <motion.div
              key={s.step}
              variants={scaleIn}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
              className="liquid-glass rounded-3xl p-8 relative flex flex-col"
              style={{ marginTop: i === 1 ? '2.5rem' : 0 }}
            >
              {/* Step numeral ghost */}
              <span
                className="absolute top-5 right-6 font-inter font-light select-none pointer-events-none"
                style={{
                  fontSize: '4rem',
                  lineHeight: 1,
                  color: 'transparent',
                  WebkitTextStroke: '1px rgba(138,160,255,0.25)',
                  letterSpacing: '-0.05em',
                }}
              >
                {s.step}
              </span>

              {/* Icon */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 relative z-10"
                style={{
                  background: 'linear-gradient(135deg, rgba(91,108,255,0.22), rgba(138,91,255,0.14))',
                  color: '#C7D1FF',
                  boxShadow:
                    'inset 0 1px 1px rgba(255,255,255,0.14), 0 8px 20px -8px rgba(91,108,255,0.35)',
                }}
              >
                {s.icon}
              </div>

              <h3 className="font-inter text-lg font-medium text-white tracking-tight mb-3">
                {s.title}
              </h3>
              <p className="font-inter font-light text-[0.94rem] leading-relaxed text-white/60 flex-1">
                {s.desc}
              </p>

              {/* Node dot on connector line */}
              <div
                className="hidden md:block absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #E8ECFF, #8AA0FF)',
                  boxShadow: '0 0 16px rgba(138,160,255,0.7)',
                }}
              />
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
