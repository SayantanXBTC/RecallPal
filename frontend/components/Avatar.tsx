'use client';

/** Reusable avatar: shows the image if present, otherwise a gradient initial. */
interface AvatarProps {
  src?:  string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}

function initial(name?: string | null): string {
  const n = (name || '').trim();
  if (!n) return '?';
  return n[0]!.toUpperCase();
}

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ src, name, size = 36, ring = false }: AvatarProps) {
  const dim = `${size}px`;
  const ringStyle = ring
    ? { boxShadow: '0 0 0 2px rgba(201,148,58,0.35), 0 2px 8px rgba(201,148,58,0.25)' }
    : {};
  if (src) {
    return (
      // Simple img — data URL or remote URL; Next Image would require domain allowlist.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || 'Profile'}
        width={size} height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: dim, height: dim, ...ringStyle }}
      />
    );
  }
  const hue = hueFor(name || 'anon');
  return (
    <div
      className="rounded-full flex items-center justify-center font-serif font-bold shrink-0"
      style={{
        width:  dim,
        height: dim,
        background: `linear-gradient(135deg, hsl(${hue},60%,55%), hsl(${(hue + 40) % 360},60%,45%))`,
        color: 'white',
        fontSize: Math.max(11, Math.floor(size * 0.42)),
        ...ringStyle,
      }}
    >
      {initial(name)}
    </div>
  );
}
