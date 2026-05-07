'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FaceResult, MultiRecognitionResult } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

interface CameraPanelProps {
  onRecognition: (result: MultiRecognitionResult) => void;
  currentResult: MultiRecognitionResult;
  onAddRequest?: () => void;
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

export default function CameraPanel({ onRecognition, currentResult, onAddRequest }: CameraPanelProps) {
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

  // Display faces updated directly from API response — no prop round-trip
  const [displayFaces, setDisplayFaces] = useState<FaceResult[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateDisplayFaces = useCallback((data: MultiRecognitionResult) => {
    const faces = (data.faces ?? []);
    if (faces.length > 0) {
      if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
      setDisplayFaces(faces);
    } else {
      if (!clearTimerRef.current) {
        clearTimerRef.current = setTimeout(() => {
          clearTimerRef.current = null;
          setDisplayFaces([]);
        }, 2000);
      }
    }
  }, []);

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
        onRecognition(data);
        updateDisplayFaces(data);
      }
    } catch { /* silent */ } finally {
      busyRef.current = false;
      setIsScanning(false);
    }
  }, [onRecognition, updateDisplayFaces, token]);

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

        {/* Scanning badge */}
        {isActive && isScanning && (
          <div className="absolute top-3 right-3 rounded-full px-2.5 py-1 flex items-center gap-1.5"
               style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9943A' }} />
            <span className="text-[10px] font-medium tracking-wider font-dm-sans" style={{ color: '#F0C97A' }}>Scanning</span>
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
            const centerXPct = ((x + w / 2) / fw) * 100;
            const rightEdgePct = ((x + w) / fw) * 100;
            const leftEdgePct  = (x / fw) * 100;
            const topPct = Math.max(2, Math.min(72, (y / fh) * 100));

            if (centerXPct < 55) {
              // face in left half — card goes to the right of face
              left = `${Math.min(rightEdgePct + 1.5, 65)}%`;
              transform = 'none';
            } else {
              // face in right half — card goes to the left of face
              left = `${Math.max(leftEdgePct - 1.5, 0)}%`;
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
              key={`face-${i}`}
              className="absolute z-30"
              style={{
                left,
                top,
                transform,
                pointerEvents: isUnknown ? 'auto' : 'none',
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
