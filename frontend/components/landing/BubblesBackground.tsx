'use client';

/**
 * Fixed cinematic background:
 *   1. Looping muted video, object-cover, full viewport
 *   2. Deep dark overlay w/ indigo/violet tint to preserve cinematic theme
 *   3. Subtle drifting orbs + horizon line for depth
 */
export default function BubblesBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
          type="video/mp4"
        />
      </video>

      {/* Dark scrim — preserves cinematic dark theme */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,7,12,0.72) 0%, rgba(5,7,12,0.62) 40%, rgba(5,7,12,0.82) 100%)',
        }}
      />

      {/* Indigo / violet color tint to enforce brand palette */}
      <div
        className="absolute inset-0 mix-blend-color"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(91,108,255,0.55) 0%, transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 85% 100%, rgba(138,91,255,0.45) 0%, transparent 65%),' +
            'linear-gradient(180deg, rgba(15,18,40,0.7) 0%, rgba(20,10,40,0.6) 100%)',
        }}
      />

      {/* Ambient additive glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% -10%, rgba(91,108,255,0.20) 0%, transparent 55%),' +
            'radial-gradient(ellipse 60% 45% at 90% 110%, rgba(138,91,255,0.16) 0%, transparent 60%)',
        }}
      />

      {/* Subtle drifting orbs (retained from cinematic redesign) */}
      <div
        className="absolute w-[520px] h-[520px] rounded-full animate-drift-slow opacity-70"
        style={{
          top:    '-10%',
          left:   '-8%',
          background: 'radial-gradient(circle, rgba(91,108,255,0.18) 0%, transparent 65%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute w-[560px] h-[560px] rounded-full animate-drift opacity-70"
        style={{
          bottom: '-14%',
          right:  '-10%',
          background: 'radial-gradient(circle, rgba(138,91,255,0.18) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Top horizon line */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(138,160,255,0.30) 50%, transparent)',
        }}
      />

      {/* Grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />
    </div>
  );
}
