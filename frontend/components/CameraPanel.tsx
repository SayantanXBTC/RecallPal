'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FaceResult, MultiRecognitionResult } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

interface CameraPanelProps {
  onRecognition:       (result: MultiRecognitionResult) => void;
  currentResult:       MultiRecognitionResult;
  onAddRequest?:       () => void;
  onAddPhotosRequest?: (name: string) => void;
}

function formatLastSeen(iso: string): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    const hrs  = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hrs  < 24)  return `${hrs}h ago`;
    if (days === 1) return 'yesterday';
    if (days < 7)   return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  } catch { return ''; }
}

// Map face bbox (in captured frame space) to percentage CSS coords.
// top/left are the top-left corner of the face box.
function bboxToPercent(face: FaceResult): { left: string; top: string; width: string } {
  const { x, y, w, frame_width, frame_height } = face.bbox
    ? { ...face.bbox, frame_width: face.frame_width, frame_height: face.frame_height }
    : { x: 0, y: 0, w: 0, frame_width: 640, frame_height: 480 };
  return {
    left:  `${Math.max(0, Math.min(85, (x / frame_width) * 100))}%`,
    top:   `${Math.max(0, Math.min(80, (y / frame_height) * 100))}%`,
    width: `${Math.max(160, Math.min(240, (w / frame_width) * 100 * 2.2))}px`,
  };
}

// Compact face card shown at each detected face position
function FaceCard({ face }: { face: FaceResult }) {
  const pos = bboxToPercent(face);
  const isRecognized = face.status === 'recognized' && face.name;

  return (
    <motion.div
      key={`${face.name ?? 'unknown'}-${face.bbox?.x ?? 0}`}
      initial={{ opacity: 0, scale: 0.82, y: -8 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      exit={{    opacity: 0, scale: 0.88,  y: -6 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className="absolute z-20 pointer-events-none"
      style={{ left: pos.left, top: pos.top, width: pos.width, maxWidth: 240 }}
    >
      {isRecognized ? (
        <div>
          {/* Name + relation row */}
          <div
            className="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5 rounded-t-xl rounded-br-sm"
            style={{ background: 'rgba(20,16,10,0.82)', backdropFilter: 'blur(12px)' }}
          >
            <span className="font-serif font-bold text-base leading-none text-white truncate max-w-[120px]">
              {face.name}
            </span>
            {face.memory?.relation && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-dm-sans shrink-0"
                style={{ background: 'rgba(79,209,197,0.30)', color: '#81e6d9', border: '1px solid rgba(79,209,197,0.45)' }}
              >
                {face.memory.relation}
              </span>
            )}
          </div>
          {/* Info row */}
          <div
            className="px-2.5 py-1.5 rounded-b-xl rounded-tl-sm"
            style={{ background: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(14px)' }}
          >
            <div className="flex items-center gap-2">
              {face.memory?.age != null && (
                <span className="text-[11px] font-dm-sans font-medium" style={{ color: '#6B5C52' }}>
                  {face.memory.age} yrs
                </span>
              )}
              {face.memory?.last_seen && (
                <span className="text-[10px] font-dm-sans" style={{ color: '#9A8C84' }}>
                  · {formatLastSeen(face.memory.last_seen)}
                </span>
              )}
            </div>
            {face.suggestion?.trim() && (
              <p className="text-[11px] leading-snug font-dm-sans italic mt-0.5 line-clamp-2" style={{ color: '#6B5C52' }}>
                {face.suggestion.trim()}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Unknown face — small badge */
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
          style={{
            background: 'rgba(10,8,4,0.75)',
            border: '1px solid rgba(246,173,85,0.45)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: '#f6ad55' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] font-dm-sans" style={{ color: '#f6ad55' }}>Unknown</span>
        </div>
      )}
    </motion.div>
  );
}

// ─── IoU face tracking ───────────────────────────────────────────────────────
// Assigns a stable numeric ID to each detected face across frames so the
// overlay React key stays constant and each card follows its own face rather
// than reshuffling when detection order changes.
type TrackedFace = FaceResult & { trackId: number; missedTicks: number };

function iou(a: NonNullable<FaceResult['bbox']>, b: NonNullable<FaceResult['bbox']>): number {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw  = Math.max(0, ix2 - ix1);
  const ih  = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

const IOU_MATCH_THRESHOLD = 0.25;
const IOU_DEDUP_THRESHOLD = 0.55; // collapse duplicate detections of same face
const MAX_MISSED_TICKS    = 3;    // drop tracks after ~2s of no match

/** Server can return two overlapping bboxes for the same physical face
 * (RetinaFace occasionally double-fires around glasses / strong shadows).
 * Collapse those to a single detection before tracking so the overlay
 * doesn't sprout twin cards. */
function dedupeFaces(faces: FaceResult[]): FaceResult[] {
  const kept: FaceResult[] = [];
  for (const f of faces) {
    if (!f.bbox) { kept.push(f); continue; }
    const dup = kept.findIndex(k => k.bbox && iou(k.bbox, f.bbox!) >= IOU_DEDUP_THRESHOLD);
    if (dup < 0) { kept.push(f); continue; }
    // Prefer the one with higher confidence; ties -> larger bbox.
    const keep = f;
    const held = kept[dup];
    const fConf = f.confidence ?? 0;
    const hConf = held.confidence ?? 0;
    if (fConf > hConf || (fConf === hConf && (f.bbox.w * f.bbox.h) > (held.bbox!.w * held.bbox!.h))) {
      kept[dup] = keep;
    }
  }
  return kept;
}

function reconcileTracks(prev: TrackedFace[], next: FaceResult[], nextId: { v: number }): TrackedFace[] {
  const usedPrev = new Set<number>();
  const usedNext = new Set<number>();
  const out: TrackedFace[] = [];

  // Greedy IoU matching: pick best pair, repeat.
  const pairs: { p: number; n: number; score: number }[] = [];
  for (let pi = 0; pi < prev.length; pi++) {
    const pb = prev[pi].bbox;
    if (!pb) continue;
    for (let ni = 0; ni < next.length; ni++) {
      const nb = next[ni].bbox;
      if (!nb) continue;
      const s = iou(pb, nb);
      if (s >= IOU_MATCH_THRESHOLD) pairs.push({ p: pi, n: ni, score: s });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const { p, n } of pairs) {
    if (usedPrev.has(p) || usedNext.has(n)) continue;
    usedPrev.add(p); usedNext.add(n);
    out.push({ ...next[n], trackId: prev[p].trackId, missedTicks: 0 });
  }
  // New tracks for unmatched detections.
  for (let ni = 0; ni < next.length; ni++) {
    if (usedNext.has(ni)) continue;
    out.push({ ...next[ni], trackId: nextId.v++, missedTicks: 0 });
  }
  // Keep stale tracks briefly (helps card not flicker between frames).
  for (let pi = 0; pi < prev.length; pi++) {
    if (usedPrev.has(pi)) continue;
    if (prev[pi].missedTicks + 1 <= MAX_MISSED_TICKS) {
      out.push({ ...prev[pi], missedTicks: prev[pi].missedTicks + 1 });
    }
  }
  return out;
}

export default function CameraPanel({ onRecognition, currentResult, onAddRequest, onAddPhotosRequest }: CameraPanelProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef     = useRef(false);
  const [scanKey, setScanKey] = useState(0);

  const [isActive,   setIsActive]   = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [camError,   setCamError]   = useState<string | null>(null);

  // Stable, tracked faces (survive across frames via IoU matching).
  const [displayFaces, setDisplayFaces] = useState<TrackedFace[]>([]);
  const displayFacesRef = useRef<TrackedFace[]>([]);
  const nextTrackIdRef  = useRef({ v: 1 });
  const clearTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { displayFacesRef.current = displayFaces; }, [displayFaces]);

  // Aging tracks handled inline in captureAndRecognize via reconcileTracks.

  useEffect(() => () => { if (clearTimerRef.current) clearTimeout(clearTimerRef.current); }, []);

  // ─── Camera ─────────────────────────────────────────────────────────────────

  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch {
      setCamError('Camera access denied — please allow camera permissions and try again.');
    }
  };

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ─── Capture & recognize ─────────────────────────────────────────────────────

  const captureAndRecognize = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (busyRef.current || !video || !canvas) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    busyRef.current = true;
    setIsScanning(true);
    setScanKey((k) => k + 1);

    try {
      canvas.width  = Math.min(video.videoWidth  || 640, 640);
      canvas.height = Math.min(video.videoHeight || 480, 480);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.80).split(',')[1];

      const res = await fetch('/api/recognize', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image: b64 }),
      });
      if (res.ok) {
        const data = await res.json() as MultiRecognitionResult;
        // Reconcile tracks outside of setState so we can hand a stable
        // snapshot to the parent (setState updaters must stay pure —
        // triggering onRecognition from inside one crashes React's
        // "setState during render" invariant).
        const prev   = displayFacesRef.current;
        const deduped = dedupeFaces(data.faces ?? []);
        const merged = reconcileTracks(prev, deduped, nextTrackIdRef.current);
        displayFacesRef.current = merged;
        setDisplayFaces(merged);
        onRecognition({
          faces: merged
            .filter((f) => f.missedTicks === 0)
            .map(({ missedTicks: _m, ...rest }) => rest as FaceResult),
        });
        if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
      }
    } catch { /* silent */ } finally {
      busyRef.current = false;
      setIsScanning(false);
    }
  }, [onRecognition, token]);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(captureAndRecognize, 700);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, captureAndRecognize]);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const softColor = dark ? '#8A7D72' : '#9A8C84';
  const hasRecognized = displayFaces.some(f => f.status === 'recognized' && f.name);
  const currentFaces = (currentResult?.faces) ?? [];
  const hasUnknownOnly = currentFaces.length > 0 && currentFaces.every(f => f.status !== 'recognized') && !hasRecognized;

  const borderColor = hasRecognized
    ? '2px solid rgba(201,148,58,0.40)'
    : hasUnknownOnly
      ? '2px solid rgba(246,173,85,0.35)'
      : `2px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-all duration-700"
      style={{
        minHeight: 420,
        background: dark ? 'rgba(18,14,9,0.6)' : 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(2px)',
        border: borderColor,
      }}
    >
      {/* Video area */}
      <div className="relative flex-1 overflow-hidden bg-black/80" style={{ minHeight: 380 }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay muted playsInline
          style={{ display: isActive ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {/* Idle placeholder */}
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ border: `2px dashed ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}` }}
            >
              <svg className="w-10 h-10" style={{ color: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            {camError
              ? <p className="text-red-400/80 text-sm text-center max-w-xs">{camError}</p>
              : <p className="text-sm tracking-wider font-dm-sans" style={{ color: softColor }}>Camera off — tap Start to begin</p>
            }
          </div>
        )}

        {/* Scan line */}
        {isActive && isScanning && (
          <div
            key={scanKey}
            className="absolute left-0 right-0 h-[2px] pointer-events-none z-10"
            style={{
              top: 0,
              background: 'linear-gradient(90deg,transparent,rgba(201,148,58,0.70),transparent)',
              animation: 'scan-line 1.6s ease-in-out',
            }}
          />
        )}

        {/* LIVE badge */}
        {isActive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
               style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)' }}>
            <div className="relative w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
              <span className="relative block w-2 h-2 rounded-full bg-red-500" />
            </div>
            <span className="text-[10px] font-semibold text-white/80 tracking-widest uppercase font-dm-sans">Live</span>
          </div>
        )}

        {/* Subtle scanning pulse (no text — quieter presence) */}
        {isActive && isScanning && (
          <div className="absolute top-3 right-3 flex items-center">
            <span className="relative w-2 h-2">
              <span className="absolute inset-0 rounded-full animate-ping opacity-70" style={{ background: '#C9943A' }} />
              <span className="relative block w-2 h-2 rounded-full" style={{ background: '#F0C97A' }} />
            </span>
          </div>
        )}

        {/* ── Per-face overlays ─────────────────────────────────────────── */}
        {isActive && displayFaces.map((face, i) => {
          let left = `${5 + i * 22}%`;
          let top  = '5%';
          let transform = 'none';

          if (face.bbox && face.frame_width && face.frame_height) {
            const { x, y, w, h } = face.bbox;
            const fw = face.frame_width;
            const fh = face.frame_height;
            const centerXPct   = ((x + w / 2) / fw) * 100;
            const rightEdgePct = ((x + w) / fw) * 100;
            const leftEdgePct  = (x / fw) * 100;
            // Anchor near the top of the head, not the top of the frame,
            // so the card sits at eye-level next to the face.
            const topPct = Math.max(2, Math.min(70, (y / fh) * 100));
            // Larger horizontal offset (~w * 0.12 of frame) so the card
            // never overlaps the face itself.
            const gapPct = Math.min(6, ((w * 0.20) / fw) * 100);

            if (centerXPct < 50) {
              left = `${Math.min(rightEdgePct + gapPct, 70)}%`;
              transform = 'none';
            } else {
              left = `${Math.max(leftEdgePct - gapPct, 0)}%`;
              transform = 'translateX(-100%)';
            }
            top = `${topPct}%`;
          }

          const isUnknown = face.status !== 'recognized' || !face.name;
          const displayName = face.name
            ? face.name.charAt(0).toUpperCase() + face.name.slice(1)
            : 'Unknown';
          return (
            <div
              key={`face-${face.trackId ?? i}`}
              className="absolute z-30"
              style={{
                left,
                top,
                transform,
                pointerEvents: 'auto',
                transition: 'left 0.18s ease, top 0.18s ease',
              }}
            >
              <div style={{
                background: isUnknown ? 'rgba(8,6,2,0.82)' : 'rgba(12,9,4,0.78)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: isUnknown ? '1px solid rgba(246,173,85,0.50)' : '1px solid rgba(201,148,58,0.45)',
                borderRadius: 14,
                padding: isUnknown ? '6px 10px' : '10px 14px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: isUnknown ? 6 : 0,
                minWidth: isUnknown ? 120 : 180,
                maxWidth: 260,
              }}>
                {isUnknown ? (
                  <>
                    {/* Unknown face header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f6ad55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span style={{ color: '#f6ad55', fontWeight: 600, fontSize: 12, letterSpacing: '0.02em' }}>
                        Unknown
                      </span>
                    </div>
                    {/* Add person button */}
                    <button
                      onClick={() => onAddRequest && onAddRequest()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'linear-gradient(135deg,#C9943A,#F0C97A)',
                        border: 'none',
                        borderRadius: 8,
                        padding: '5px 10px',
                        cursor: 'pointer',
                        color: '#1a1208',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        boxShadow: '0 2px 10px rgba(201,148,58,0.40)',
                        width: '100%',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                        <line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" />
                      </svg>
                      Add Person
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {/* Name + relation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#C9943A,#F0C97A)',
                        flexShrink: 0,
                        boxShadow: '0 0 6px rgba(201,148,58,0.7)',
                        display: 'inline-block',
                      }} />
                      <span style={{ color: '#F5EFE8', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', lineHeight: 1 }}>
                        {displayName}
                      </span>
                      {face.memory?.relation && (
                        <span style={{
                          background: 'rgba(201,148,58,0.18)',
                          border: '1px solid rgba(201,148,58,0.35)',
                          borderRadius: 20,
                          padding: '2px 8px',
                          color: '#C9943A',
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.01em',
                          lineHeight: 1.4,
                        }}>
                          {face.memory.relation}
                        </span>
                      )}
                    </div>

                    {/* Age + last seen */}
                    {(face.memory?.age != null || face.memory?.last_seen) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {face.memory?.age != null && (
                          <span style={{ color: '#C9943A', fontSize: 11, fontWeight: 600 }}>
                            {face.memory.age} yrs
                          </span>
                        )}
                        {face.memory?.last_seen && (
                          <span style={{ color: 'rgba(245,239,232,0.45)', fontSize: 10 }}>
                            · {formatLastSeen(face.memory.last_seen)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Likes */}
                    {face.memory?.likes && face.memory.likes.length > 0 && (
                      <div>
                        <div style={{ color: 'rgba(245,239,232,0.35)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                          Likes
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {face.memory.likes.map((like, li) => (
                            <span key={li} style={{
                              background: 'rgba(201,148,58,0.14)',
                              border: '1px solid rgba(201,148,58,0.30)',
                              borderRadius: 10,
                              padding: '2px 7px',
                              color: '#F0C97A',
                              fontSize: 10,
                              fontWeight: 500,
                            }}>
                              {like}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {face.memory?.notes && face.memory.notes.trim().length > 0 && (
                      <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        paddingTop: 6,
                      }}>
                        <div style={{ color: 'rgba(245,239,232,0.35)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                          Remember
                        </div>
                        <p style={{ color: 'rgba(245,239,232,0.70)', fontSize: 11, lineHeight: 1.45, margin: 0 }}>
                          {face.memory.notes.trim()}
                        </p>
                      </div>
                    )}

                    {/* Improve recognition — append more photos for this person */}
                    {onAddPhotosRequest && face.name && (
                      <button
                        onClick={() => onAddPhotosRequest(face.name as string)}
                        style={{
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          background: 'rgba(201,148,58,0.14)',
                          border: '1px solid rgba(201,148,58,0.35)',
                          borderRadius: 8,
                          padding: '5px 10px',
                          cursor: 'pointer',
                          pointerEvents: 'auto',
                          color: '#F0C97A',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          width: '100%',
                        }}
                        title={`Improve recognition for ${face.name}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <line x1="12" y1="4" x2="12" y2="20" />
                          <line x1="4"  y1="12" x2="20" y2="12" />
                        </svg>
                        Add More Photos
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

      </div>

      {/* Controls bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-t"
        style={{
          borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          background:  dark ? 'rgba(18,14,9,0.55)'    : 'rgba(255,255,255,0.55)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-dm-sans" style={{ color: softColor }}>
          {isActive ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9943A' }} />
              <span role="status" aria-live="polite">Scanning every 0.7s</span>
            </>
          ) : (
            <span>Press Start Camera to begin</span>
          )}
        </div>
        <button
          onClick={isActive ? stopCamera : startCamera}
          aria-label={isActive ? 'Stop camera' : 'Start camera'}
          className="px-5 py-2 rounded-xl text-xs font-semibold font-dm-sans transition-all duration-200"
          style={isActive
            ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }
            : { background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white', boxShadow: '0 4px 14px rgba(201,148,58,0.35)' }
          }
        >
          {isActive ? 'Stop Video' : 'Start Camera'}
        </button>
      </div>
    </div>
  );
}
