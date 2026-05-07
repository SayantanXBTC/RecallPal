'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

interface AddPhotosModalProps {
  isOpen:     boolean;
  personName: string;
  onClose:    () => void;
  onSuccess:  (added: number) => void;
}

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;

type Mode = 'camera' | 'upload';

export default function AddPhotosModal({ isOpen, personName, onClose, onSuccess }: AddPhotosModalProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode,     setMode]     = useState<Mode>('camera');
  const [photos,   setPhotos]   = useState<string[]>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

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
      setCameraOn(true);
    } catch {
      setCamError('Camera unavailable — use Upload mode instead.');
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPhotos([]);
      setError(null);
      setMode('camera');
      startCamera();
    } else {
      stopCamera();
      setPhotos([]);
    }
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Switch modes
  const switchMode = (m: Mode) => {
    if (m === 'upload') stopCamera();
    if (m === 'camera') startCamera();
    setMode(m);
    setPhotos([]);
    setError(null);
  };

  const capturePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || photos.length >= MAX_PHOTOS) return;
    canvas.width  = Math.min(video.videoWidth  || 640, 640);
    canvas.height = Math.min(video.videoHeight || 480, 480);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/jpeg', 0.80).split(',')[1];
    setPhotos((prev) => [...prev, b64]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toLoad = files.slice(0, remaining);
    toLoad.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        // Strip data:image/...;base64, prefix
        const b64 = dataUrl.split(',')[1];
        if (b64) setPhotos((prev) => prev.length < MAX_PHOTOS ? [...prev, b64] : prev);
      };
      reader.readAsDataURL(file);
    });
    // Reset so same files can be re-selected
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (photos.length < MIN_PHOTOS) {
      setError(`Need at least ${MIN_PHOTOS} photos.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/add-photos', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: personName, images: photos }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onSuccess(data.embeddings_added as number);
        onClose();
      } else {
        setError(data.message ?? 'Failed to add photos.');
      }
    } catch {
      setError('Connection error — try again.');
    } finally {
      setSaving(false);
    }
  };

  const cardBg   = dark ? '#1C1710' : '#FDFAF5';
  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';
  const borderCol = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-3xl flex flex-col overflow-hidden"
            style={{ background: cardBg, boxShadow: '0 24px 80px rgba(0,0,0,0.45)', maxHeight: '90vh' }}
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-lg font-serif font-bold" style={{ color: textMain }}>
                  Add More Photos
                </h2>
                <p className="text-sm font-dm-sans capitalize" style={{ color: textSoft }}>
                  for {personName}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', color: textSoft }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mode toggle */}
            <div className="mx-6 mb-4 flex p-1 rounded-xl" style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              {(['camera', 'upload'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold font-dm-sans transition-all capitalize"
                  style={{
                    background: mode === m ? (dark ? 'rgba(201,148,58,0.18)' : 'white') : 'transparent',
                    color:      mode === m ? '#C9943A' : textSoft,
                    boxShadow:  mode === m && !dark ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {m === 'camera' ? '📷 Camera' : '🖼 Upload'}
                </button>
              ))}
            </div>

            {/* Camera mode */}
            {mode === 'camera' && (
              <>
                <div className="relative mx-4 rounded-2xl overflow-hidden bg-black" style={{ height: 220 }}>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay muted playsInline
                    style={{ display: cameraOn ? 'block' : 'none' }}
                  />
                  <canvas ref={canvasRef} className="hidden" aria-hidden />
                  {!cameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <p className="text-sm font-dm-sans text-center px-4" style={{ color: 'rgba(255,255,255,0.50)' }}>
                        {camError ?? 'Starting camera…'}
                      </p>
                      {camError && (
                        <button
                          onClick={() => switchMode('upload')}
                          className="text-xs font-semibold font-dm-sans px-3 py-1.5 rounded-xl"
                          style={{ background: 'rgba(201,148,58,0.15)', color: '#C9943A', border: '1px solid rgba(201,148,58,0.30)' }}
                        >
                          Switch to Upload
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold font-dm-sans"
                    style={{ background: 'rgba(0,0,0,0.60)', color: photos.length >= MIN_PHOTOS ? '#86efac' : '#F0C97A' }}
                  >
                    {photos.length}/{MAX_PHOTOS}
                  </div>
                </div>

                {/* Progress dots */}
                <div className="flex gap-1.5 justify-center py-3">
                  {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-200"
                      style={{
                        width:      i < photos.length ? 10 : 6,
                        height:     i < photos.length ? 10 : 6,
                        background: i < photos.length
                          ? (i < MIN_PHOTOS ? '#C9943A' : '#86efac')
                          : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
                      }}
                    />
                  ))}
                </div>

                <p className="text-center text-xs font-dm-sans px-6" style={{ color: textSoft }}>
                  {photos.length < MIN_PHOTOS
                    ? `Capture ${MIN_PHOTOS - photos.length} more — look at the camera`
                    : photos.length < MAX_PHOTOS
                      ? `${MAX_PHOTOS - photos.length} more optional — different angles help`
                      : 'Maximum photos captured'}
                </p>
              </>
            )}

            {/* Upload mode */}
            {mode === 'upload' && (
              <div className="mx-4 flex flex-col gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photos.length >= MAX_PHOTOS}
                  className="rounded-2xl flex flex-col items-center justify-center gap-2 py-8 transition-all disabled:opacity-40"
                  style={{
                    border: `2px dashed ${dark ? 'rgba(201,148,58,0.30)' : 'rgba(201,148,58,0.35)'}`,
                    background: dark ? 'rgba(201,148,58,0.05)' : 'rgba(201,148,58,0.04)',
                    cursor: photos.length >= MAX_PHOTOS ? 'not-allowed' : 'pointer',
                  }}
                >
                  <svg className="w-8 h-8" style={{ color: 'rgba(201,148,58,0.60)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-dm-sans font-medium" style={{ color: '#C9943A' }}>
                    Choose Photos
                  </span>
                  <span className="text-xs font-dm-sans" style={{ color: textSoft }}>
                    {photos.length}/{MAX_PHOTOS} selected · need at least {MIN_PHOTOS}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Thumbnails */}
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((_, i) => (
                      <div
                        key={i}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold font-dm-sans"
                        style={{ background: 'rgba(201,148,58,0.14)', border: '1px solid rgba(201,148,58,0.30)', color: '#C9943A' }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-center text-xs text-red-400 font-dm-sans px-6 pt-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 px-6 py-5">
              {mode === 'camera' && (
                <button
                  onClick={capturePhoto}
                  disabled={!cameraOn || photos.length >= MAX_PHOTOS}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-40"
                  style={{
                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    color: textMain,
                    border: `1px solid ${borderCol}`,
                  }}
                >
                  Capture
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={photos.length < MIN_PHOTOS || saving}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg,#C9943A,#F0C97A)',
                  color: 'white',
                  boxShadow: '0 4px 16px rgba(201,148,58,0.35)',
                }}
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'Save Photos'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
