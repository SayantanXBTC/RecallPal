'use client';

import { useEffect, useState } from 'react';

/** Reusable avatar. Renders the image if present and loadable, otherwise
 *  a gradient initial. Two design decisions worth noting:
 *
 *  - Module-level caches (LOADED / FAILED) survive component unmount, so
 *    navigating between routes doesn't re-trigger the "S initial → image"
 *    flicker. Once a URL has loaded successfully in this tab, subsequent
 *    mounts start straight in the 'ok' state.
 *  - onError only marks a URL as failed after the second consecutive
 *    failure. Google's avatar CDN occasionally rate-limits a fresh mount;
 *    the image usually succeeds on the retry the browser does on its
 *    own, so a one-shot error shouldn't lock us into the fallback. */
interface AvatarProps {
  src?:  string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}

const LOADED_URLS: Set<string> = new Set();
const FAILED_STRIKES: Map<string, number> = new Map();

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
  const initialState: 'ok' | 'idle' | 'err' =
    !src ? 'err'
      : LOADED_URLS.has(src) ? 'ok'
      : (FAILED_STRIKES.get(src) ?? 0) >= 2 ? 'err'
      : 'idle';
  const [state, setState] = useState<'idle' | 'ok' | 'err'>(initialState);

  useEffect(() => {
    if (!src) { setState('err'); return; }
    if (LOADED_URLS.has(src)) { setState('ok'); return; }
    if ((FAILED_STRIKES.get(src) ?? 0) >= 2) { setState('err'); return; }
    setState('idle');
  }, [src]);

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
      {src && state !== 'err' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size} height={size}
          onLoad={() => {
            LOADED_URLS.add(src);
            FAILED_STRIKES.delete(src);
            setState('ok');
          }}
          onError={() => {
            const strikes = (FAILED_STRIKES.get(src) ?? 0) + 1;
            FAILED_STRIKES.set(src, strikes);
            if (strikes >= 2) setState('err');
            // otherwise stay in 'idle' — the browser will retry on the
            // next render or route change without us re-issuing the src.
          }}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
    </div>
  );
}
