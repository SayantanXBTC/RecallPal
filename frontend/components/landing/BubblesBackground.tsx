'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme-context';

// Each bubble config
interface Bubble {
  id:       number;
  x:        number;   // % from left
  size:     number;   // px
  duration: number;   // seconds to float up
  delay:    number;   // seconds before starting
  opacity:  number;
  wobble:   number;   // horizontal sway amplitude px
}

// Reduced from 24 to 10 bubbles at ~55% opacity to give copy the visual
// priority. Distributed across the width so motion is still felt but the
// composition breathes.
const BUBBLES: Bubble[] = [
  { id:  1, x:  8, size: 26, duration: 14, delay: 0,    opacity: 0.20, wobble: 20 },
  { id:  2, x: 18, size: 16, duration: 10, delay: 2.5,  opacity: 0.28, wobble: 12 },
  { id:  3, x: 28, size: 40, duration: 18, delay: 1.2,  opacity: 0.14, wobble: 28 },
  { id:  4, x: 42, size: 22, duration: 12, delay: 4.0,  opacity: 0.22, wobble: 16 },
  { id:  5, x: 52, size: 34, duration: 16, delay: 6.0,  opacity: 0.16, wobble: 24 },
  { id:  6, x: 62, size: 18, duration: 11, delay: 3.5,  opacity: 0.26, wobble: 14 },
  { id:  7, x: 72, size: 46, duration: 20, delay: 0.6,  opacity: 0.12, wobble: 32 },
  { id:  8, x: 82, size: 20, duration: 12, delay: 5.5,  opacity: 0.24, wobble: 15 },
  { id:  9, x: 92, size: 28, duration: 15, delay: 2.0,  opacity: 0.18, wobble: 20 },
  { id: 10, x: 36, size: 14, duration: 9,  delay: 8.0,  opacity: 0.30, wobble: 11 },
];

export default function BubblesBackground() {
  const { theme } = useTheme();

  // Bubble colour based on theme
  const bubbleColor = theme === 'dark'
    ? 'rgba(201,148,58,'    // gold tint for dark
    : 'rgba(201,148,58,';   // same warm gold for light

  const shimmerColor = theme === 'dark'
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(255,255,255,0.55)';

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {BUBBLES.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full"
          style={{
            left:    `${b.x}%`,
            bottom:  `-${b.size + 20}px`,
            width:   `${b.size}px`,
            height:  `${b.size}px`,
            // Layered radial for glass-bubble look: inner highlight + ring
            background: `radial-gradient(circle at 35% 35%, ${shimmerColor} 0%, transparent 60%), radial-gradient(circle at 50% 50%, ${bubbleColor}${b.opacity * 0.6}) 0%, ${bubbleColor}${b.opacity}) 70%, transparent 100%)`,
            border: `1px solid ${bubbleColor}${Math.min(b.opacity + 0.15, 0.8)})`,
            boxShadow: `inset 0 0 ${b.size * 0.3}px ${bubbleColor}${b.opacity * 0.4}), 0 0 ${b.size * 0.2}px ${bubbleColor}${b.opacity * 0.2})`,
            animation: `bubble-rise ${b.duration}s ease-in ${b.delay}s infinite, bubble-wobble ${b.duration * 0.6}s ease-in-out ${b.delay}s infinite alternate`,
            '--wobble': `${b.wobble}px`,
          } as React.CSSProperties}
        />
      ))}

      <style>{`
        @keyframes bubble-rise {
          0%   { transform: translateY(0)   scale(1);    opacity: 0; }
          5%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(-110vh) scale(0.85); opacity: 0; }
        }
        @keyframes bubble-wobble {
          0%   { margin-left: 0px; }
          100% { margin-left: var(--wobble); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bubble-bg-el { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}
