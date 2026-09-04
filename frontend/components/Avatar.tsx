'use client';

import { useEffect, useState } from 'react';

/** Reusable avatar: shows the image if present and loadable, otherwise a
 *  gradient initial. The fallback letter never renders behind a still-
 *  loading <img> — we wait for onLoad / onError before deciding. */
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
  const [state, setState] = useState<'idle' | 'ok' | 'err'>(src ? 'idle' : 'err');

  useEffect(() => { setState(src ? 'idle' : 'err'); }, [src]);

  const ringStyle = ring
    ? { boxShadow: '0 0 0 2px rgba(201,148,58,0.35), 0 2px 8px rgba(201,148,58,0.25)' }
    : {};

  const hue = hueFor(name || 'anon');
  const initialBg = `linear-gradient(135deg, hsl(${hue},60%,55%), hsl(${(hue + 40) % 360},60%,45%))`;

  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center font-serif font-bold shrink-0 relative"
      style={{
        width:  dim,
        height: dim,
        background: state === 'ok' ? '#111' : initialBg,
        color: 'white',
        fontSize: Math.max(11, Math.floor(size * 0.42)),
        ...ringStyle,
      }}
    >
      {state !== 'ok' && <span aria-hidden>{initial(name)}</span>}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size} height={size}
          onLoad={()  => setState('ok')}
          onError={() => setState('err')}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: state === 'err' ? 'none' : 'block', opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
    </div>
  );
}
