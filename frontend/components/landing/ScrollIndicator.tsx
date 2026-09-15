'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function ScrollIndicator() {
  const scroll = () => {
    const el = document.querySelector('#about');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col items-center gap-2 pb-6">
      <motion.button
        onClick={scroll}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="liquid-glass w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
        aria-label="Scroll down"
      >
        <motion.span
          animate={{ y: [0, 4, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        >
          <ChevronDown size={16} strokeWidth={1.6} />
        </motion.span>
      </motion.button>
      <span
        className="font-inter text-[0.65rem] uppercase tracking-[0.32em] text-white/35"
      >
        Scroll
      </span>
    </div>
  );
}
