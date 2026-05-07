'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaceResult } from '@/lib/types';
import { generateStarters } from '@/lib/conversation-starters';
import { useTheme } from '@/lib/theme-context';

interface ConversationStartersProps {
  faces: FaceResult[];
}

const ICONS = ['💬', '💡', '📌'];

export default function ConversationStarters({ faces }: ConversationStartersProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const face = faces.find(f => f.status === 'recognized' && f.name) ?? null;

  // Depend on name (not full face object) so starters don't re-randomise every
  // 700ms poll cycle — they update only when the recognised person changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const starters = useMemo(() => (face ? generateStarters(face) : []), [face?.name]);

  const name = face?.name
    ? face.name.charAt(0).toUpperCase() + face.name.slice(1)
    : null;

  return (
    <AnimatePresence>
      {face && starters.length > 0 && (
        <motion.div
          key={`starters-${face.name}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="rounded-2xl px-4 py-3"
          style={{
            background:     dark ? 'rgba(18,14,9,0.72)' : 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${dark ? 'rgba(201,148,58,0.22)' : 'rgba(201,148,58,0.28)'}`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#C9943A' }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-widest font-dm-sans"
              style={{ color: dark ? '#8A7D72' : '#9A8C84' }}
            >
              Conversation with {name}
            </span>
          </div>

          {/* Prompt chips */}
          <div className="flex flex-wrap gap-2">
            {starters.map((starter, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 px-3 py-2 rounded-xl text-sm font-dm-sans leading-snug"
                style={{
                  background: dark ? 'rgba(201,148,58,0.10)' : 'rgba(201,148,58,0.07)',
                  border:     `1px solid ${dark ? 'rgba(201,148,58,0.22)' : 'rgba(201,148,58,0.20)'}`,
                  color:      dark ? '#F5EFE8' : '#3A2F28',
                  maxWidth:   280,
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>
                  {ICONS[i]}
                </span>
                <span>{starter}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
