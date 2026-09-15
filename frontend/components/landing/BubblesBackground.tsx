'use client';

/**
 * Fixed cinematic background — video + scrim + brand tint.
 * Scrim / tint / orb colors are driven by CSS variables on `.marketing-root`
 * so the theme toggle can swap them at runtime.
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

      {/* Dark scrim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, var(--m-scrim-top) 0%, var(--m-scrim-mid) 40%, var(--m-scrim-bot) 100%)',
        }}
      />

      {/* Brand color tint (color blend for palette lock) */}
      <div
        className="absolute inset-0 mix-blend-color"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, var(--m-tint-a) 0%, transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 85% 100%, var(--m-tint-b) 0%, transparent 65%),' +
            'linear-gradient(180deg, var(--m-tint-base) 0%, var(--m-tint-base-b) 100%)',
        }}
      />

      {/* Additive ambient glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% -10%, var(--m-glow-a) 0%, transparent 55%),' +
            'radial-gradient(ellipse 60% 45% at 90% 110%, var(--m-glow-b) 0%, transparent 60%)',
        }}
      />

      {/* Drift orbs */}
      <div
        className="absolute w-[520px] h-[520px] rounded-full animate-drift-slow opacity-70"
        style={{
          top:    '-10%',
          left:   '-8%',
          background: 'radial-gradient(circle, var(--m-orb-a) 0%, transparent 65%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute w-[560px] h-[560px] rounded-full animate-drift opacity-70"
        style={{
          bottom: '-14%',
          right:  '-10%',
          background: 'radial-gradient(circle, var(--m-orb-b) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Top horizon line */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--m-horizon) 50%, transparent)',
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
