'use client';

/**
 * Cinematic atmospheric background — dark, layered orbs, subtle grain, faint grid.
 * Replaces the previous "bubbles" identity while keeping the same component name
 * so the marketing layout continues to mount it unchanged.
 */
export default function BubblesBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {/* Deep vignette base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(91,108,255,0.14) 0%, transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 85% 100%, rgba(138,91,255,0.12) 0%, transparent 65%),' +
            'radial-gradient(ellipse 60% 45% at 10% 70%, rgba(107,201,255,0.08) 0%, transparent 60%),' +
            'linear-gradient(180deg, #05070C 0%, #07080E 45%, #05070C 100%)',
        }}
      />

      {/* Drifting orbs */}
      <div
        className="absolute w-[720px] h-[720px] rounded-full animate-drift"
        style={{
          top:    '-14%',
          left:   '-10%',
          background: 'radial-gradient(circle, rgba(91,108,255,0.22) 0%, transparent 65%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute w-[640px] h-[640px] rounded-full animate-drift-slow"
        style={{
          bottom: '-16%',
          right:  '-12%',
          background: 'radial-gradient(circle, rgba(138,91,255,0.20) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }}
      />
      <div
        className="absolute w-[520px] h-[520px] rounded-full animate-float-slow"
        style={{
          top:    '38%',
          left:   '52%',
          background: 'radial-gradient(circle, rgba(107,201,255,0.14) 0%, transparent 65%)',
          filter: 'blur(70px)',
        }}
      />

      {/* Faint grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
        }}
      />

      {/* Subtle noise */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Top horizon */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(138,160,255,0.35) 50%, transparent)',
        }}
      />
    </div>
  );
}
