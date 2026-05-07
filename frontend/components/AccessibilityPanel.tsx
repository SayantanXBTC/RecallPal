'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccessibility, FontSize } from '@/lib/accessibility-context';
import { useTheme } from '@/lib/theme-context';

export default function AccessibilityPanel() {
  const { fontSize, highContrast, setFontSize, toggleContrast } = useAccessibility();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [open, setOpen] = useState(false);

  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';
  const panelBg  = dark ? '#1C1710' : '#FDFAF5';

  const fontSizes: { value: FontSize; label: string }[] = [
    { value: 'normal', label: 'A'   },
    { value: 'large',  label: 'A+'  },
    { value: 'xl',     label: 'A++' },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: open
            ? 'rgba(201,148,58,0.15)'
            : dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          border: `1px solid ${open ? 'rgba(201,148,58,0.35)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          color: open ? '#C9943A' : textSoft,
        }}
        aria-label="Accessibility options"
        aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.94,  y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 z-50 rounded-2xl p-4 w-64"
            style={{
              background:   panelBg,
              border:       `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow:    '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <p className="text-xs font-semibold font-dm-sans uppercase tracking-widest mb-3" style={{ color: textSoft }}>
              Accessibility
            </p>

            {/* Font size */}
            <p className="text-xs font-dm-sans mb-2" style={{ color: textSoft }}>Text Size</p>
            <div className="flex gap-2 mb-4">
              {fontSizes.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFontSize(value)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold font-dm-sans transition-all"
                  style={{
                    background: fontSize === value
                      ? 'linear-gradient(135deg,#C9943A,#F0C97A)'
                      : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                    color: fontSize === value ? 'white' : textMain,
                  }}
                  aria-pressed={fontSize === value}
                  aria-label={`Set text size to ${value}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* High contrast */}
            <button
              onClick={toggleContrast}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: highContrast
                  ? 'rgba(201,148,58,0.15)'
                  : dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${highContrast ? 'rgba(201,148,58,0.35)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              }}
              aria-pressed={highContrast}
            >
              <span className="text-xs font-dm-sans" style={{ color: textMain }}>High Contrast</span>
              <div
                className="w-8 h-4 rounded-full transition-all relative"
                style={{ background: highContrast ? '#C9943A' : dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}
              >
                <span
                  className="absolute top-0.5 rounded-full bg-white transition-all"
                  style={{ width: 12, height: 12, left: highContrast ? 14 : 2 }}
                />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
