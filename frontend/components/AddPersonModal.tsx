'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';

interface AddPersonModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess: (name: string) => void;
}

const RELATIONS = [
  'Son', 'Daughter', 'Husband', 'Wife', 'Partner',
  'Father', 'Mother', 'Brother', 'Sister',
  'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
  'Friend', 'Neighbour', 'Caregiver', 'Doctor', 'Nurse', 'Other',
];

const MIN_PHOTOS  = 5;
const MAX_PHOTOS  = 10;
const MAX_DIM     = 640;   // max pixel dimension for compressed captures
const JPEG_Q      = 0.82;  // JPEG quality for capture canvas

// ─── Image compression ───────────────────────────────────────────────────────

function compressFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  let w = video.videoWidth  || 640;
  let h = video.videoHeight || 480;

  // Shrink to MAX_DIM while keeping aspect ratio
  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', JPEG_Q).split(',')[1];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddPersonModal({ isOpen, onClose, onSuccess }: AddPersonModalProps) {
  const { addToast } = useToast();
  const { token } = useAuth();

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [name,       setName]       = useState('');
  const [relation,   setRelation]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [age,        setAge]        = useState('');
  const [likes,      setLikes]      = useState<string[]>([]);
  const [likeInput,  setLikeInput]  = useState('');
  const [photos,     setPhotos]     = useState<string[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [consent,    setConsent]    = useState(false);
  const [granter,    setGranter]    = useState('');
  const [camReady,   setCamReady]   = useState(false);
  const [camError,   setCamError]   = useState<string | null>(null);
  const [flash,      setFlash]      = useState(false);

  // ─── Camera ──────────────────────────────────────────────────────────────

  const startCam = useCallback(async () => {
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
      setCamReady(true);
    } catch {
      setCamError(
        'Could not access the camera. Make sure no other app is using it, ' +
        'then allow camera permissions and try again.',
      );
    }
  }, []);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
  }, []);

  useEffect(() => {
    if (isOpen) startCam();
    else        stopCam();
    return () => stopCam();
  }, [isOpen, startCam, stopCam]);

  // ─── Reset on close ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setRelation('');
      setNotes('');
      setAge('');
      setLikes([]);
      setLikeInput('');
      setPhotos([]);
      setSaving(false);
      setSaveError(null);
      setConsent(false);
      setGranter('');
    }
  }, [isOpen]);

  // ─── Discard-confirmation close ──────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (photos.length > 0) {
      if (!window.confirm('Discard captured photos and close?')) return;
    }
    onClose();
  }, [photos.length, onClose]);

  // ─── Escape key ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  // ─── Capture ─────────────────────────────────────────────────────────────

  const capture = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !camReady) return;
    if (photos.length >= MAX_PHOTOS) {
      addToast(`Maximum ${MAX_PHOTOS} photos reached`, 'info');
      return;
    }

    const b64 = compressFrame(video, canvas);
    if (!b64) return;

    setPhotos((prev) => [...prev, b64]);

    // Brief white-flash feedback
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  }, [camReady, photos.length, addToast]);

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const trimmedName = name.trim();
    setSaveError(null);

    if (!trimmedName || trimmedName.length < 2) {
      setSaveError('Name must be at least 2 characters.');
      return;
    }
    if (!relation) {
      setSaveError('Please select a relationship.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setSaveError(`Capture at least ${MIN_PHOTOS} photos (${photos.length}/${MIN_PHOTOS} so far).`);
      return;
    }
    if (!consent) {
      setSaveError('Please confirm biometric consent below before saving.');
      return;
    }
    if (!granter.trim()) {
      setSaveError('Please enter the name of the person granting consent.');
      return;
    }

    setSaving(true);
    try {
      const parsedAge = age.trim() ? parseInt(age.trim(), 10) : null;
      const res = await fetch('/api/add-person', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:    JSON.stringify({
          name:     trimmedName,
          relation,
          notes,
          age:      Number.isFinite(parsedAge) && parsedAge! > 0 ? parsedAge : null,
          likes,
          images:   photos,
          consent: {
            accepted:         true,
            granter_name:     granter.trim(),
            granter_relation: relation,
          },
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'success') {
        const skippedNote = data.skipped > 0
          ? ` (${data.skipped} photo${data.skipped > 1 ? 's' : ''} skipped)`
          : '';
        addToast(
          `${trimmedName} added successfully${skippedNote}. They will now be recognized.`,
          'success',
        );
        onSuccess(trimmedName);
        onClose();
      } else {
        const msg = data.message ?? 'Failed to add person. Please try again.';
        setSaveError(
          data.embeddings_count !== undefined
            ? `${msg} (${data.embeddings_count} of ${photos.length} photos had a detectable face.)`
            : msg,
        );
      }
    } catch {
      setSaveError('Connection error — please check the server and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────

  const nameValid  = name.trim().length >= 2;
  const canSave    = nameValid && !!relation && photos.length >= MIN_PHOTOS
                     && consent && !!granter.trim() && !saving;
  const photoPct   = Math.min(100, (photos.length / MAX_PHOTOS) * 100);
  const photoReady = photos.length >= MIN_PHOTOS;

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4, 8, 15, 0.88)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a new person"
    >
      <div
        className="glass rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto anim-modal-in"
        style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 glass z-10">
          <div>
            <h2 className="text-base font-bold text-white/85">Add New Person</h2>
            <p className="text-[11px] text-white/30 mt-0.5">
              Teach the system to recognise someone new
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/8 transition-all"
            aria-label="Close modal"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Left: webcam + capture ─────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-white/30 tracking-widest uppercase">
              Webcam capture
            </p>

            {/* Camera preview */}
            <div
              className="relative rounded-xl overflow-hidden bg-black/50 border border-white/8"
              style={{ aspectRatio: '4/3' }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay muted playsInline
                style={{ display: camReady ? 'block' : 'none' }}
              />
              <canvas ref={canvasRef} className="hidden" aria-hidden />

              {/* Capture flash overlay */}
              {flash && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'rgba(255,255,255,0.55)', transition: 'opacity 0.18s' }}
                />
              )}

              {/* Spinner while camera initialises */}
              {!camReady && !camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                  <p className="text-xs text-white/30">Starting camera…</p>
                </div>
              )}

              {/* Camera error */}
              {camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
                  <svg className="w-8 h-8 text-red-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8.82a1 1 0 01.553-.894L8 6v8l-4.447-2.069A1 1 0 013 10.18V8.82z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3l18 18" />
                  </svg>
                  <p className="text-red-400/70 text-xs leading-relaxed">{camError}</p>
                  <button
                    onClick={startCam}
                    className="btn-teal px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Photo count badge */}
              {camReady && photos.length > 0 && (
                <div className="absolute top-2 right-2 glass rounded-full px-2 py-0.5 text-[11px] font-bold text-teal-400">
                  {photos.length}/{MAX_PHOTOS}
                </div>
              )}
            </div>

            {/* Capture button */}
            <button
              onClick={capture}
              disabled={!camReady || photos.length >= MAX_PHOTOS}
              className="btn-teal px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Capture Photo
            </button>

            {/* Progress bar + status */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span
                  className={`text-[11px] font-semibold ${
                    photoReady ? 'text-teal-400' : 'text-amber-400'
                  }`}
                >
                  {photoReady
                    ? `✓ ${photos.length} photos — ready to save`
                    : `${photos.length}/${MIN_PHOTOS} — ${MIN_PHOTOS - photos.length} more required`}
                </span>
                <span className="text-[10px] text-white/20">{photos.length}/{MAX_PHOTOS}</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${photoPct}%`,
                    background: photoReady
                      ? 'linear-gradient(90deg, #4fd1c5, #81e6d9)'
                      : 'linear-gradient(90deg, #f6ad55, #fbd38d)',
                  }}
                />
              </div>
            </div>

            {/* Angle tip */}
            <div className="glass rounded-xl px-3 py-2.5 flex gap-2.5 items-start">
              <svg className="w-3.5 h-3.5 text-teal-400/50 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-white/35 leading-relaxed">
                For best recognition, capture photos from slightly different angles — look
                left, right, slightly up, and straight ahead.
              </p>
            </div>

            {/* Thumbnail grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-5 gap-1.5">
                {photos.map((b64, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-lg overflow-hidden group border border-white/8"
                    style={{ aspectRatio: '1' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/jpeg;base64,${b64}`}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Number label */}
                    <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-white/50 group-hover:hidden">
                      {idx + 1}
                    </span>
                    {/* Remove overlay */}
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      aria-label={`Remove photo ${idx + 1}`}
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: form ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-white/30 tracking-widest uppercase">
              Person details
            </p>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/45 font-medium" htmlFor="add-name">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                id="add-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaveError(null); }}
                placeholder="e.g. Sarah Johnson"
                className="glass-input w-full rounded-xl px-4 py-2.5 text-sm"
                autoComplete="off"
              />
              {name.trim().length > 0 && name.trim().length < 2 && (
                <p className="text-[11px] text-amber-400/80">Minimum 2 characters</p>
              )}
            </div>

            {/* Relation */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/45 font-medium" htmlFor="add-relation">
                Relationship <span className="text-red-400">*</span>
              </label>
              <select
                id="add-relation"
                value={relation}
                onChange={(e) => { setRelation(e.target.value); setSaveError(null); }}
                className="glass-input w-full rounded-xl px-4 py-2.5 text-sm appearance-none cursor-pointer"
              >
                <option value="">Select relationship…</option>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Age */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/45 font-medium" htmlFor="add-age">
                Age
                <span className="text-white/25 font-normal ml-1">(optional)</span>
              </label>
              <input
                id="add-age"
                type="number"
                min={1}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 68"
                className="glass-input w-full rounded-xl px-4 py-2.5 text-sm"
              />
            </div>

            {/* Likes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/45 font-medium" htmlFor="add-likes">
                Likes / Interests
                <span className="text-white/25 font-normal ml-1">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="add-likes"
                  type="text"
                  value={likeInput}
                  onChange={(e) => setLikeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && likeInput.trim()) {
                      e.preventDefault();
                      const tag = likeInput.trim().replace(/,$/, '');
                      if (tag && !likes.includes(tag)) setLikes((prev) => [...prev, tag]);
                      setLikeInput('');
                    }
                  }}
                  placeholder="Type an interest, press Enter"
                  className="glass-input flex-1 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              {likes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {likes.map((like) => (
                    <span
                      key={like}
                      className="glass flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs text-teal-300/80 border border-teal-400/15"
                    >
                      {like}
                      <button
                        type="button"
                        onClick={() => setLikes((prev) => prev.filter((l) => l !== like))}
                        className="text-white/30 hover:text-red-400/80 transition-colors ml-0.5"
                        aria-label={`Remove ${like}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs text-white/45 font-medium" htmlFor="add-notes">
                Notes
                <span className="text-white/25 font-normal ml-1">(optional but helpful)</span>
              </label>
              <textarea
                id="add-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hobbies, preferences, important things to remember…"
                rows={3}
                className="glass-input w-full rounded-xl px-4 py-2.5 text-sm resize-none"
              />
            </div>

            {/* Biometric consent (GDPR Art. 9) */}
            <div className="glass rounded-xl px-4 py-3 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 shrink-0 accent-teal-400"
                />
                <span className="text-xs text-white/70 leading-relaxed">
                  I confirm the person named above (or their legal guardian) has
                  given informed consent to store and process their face
                  biometric data for the purpose of recognition assistance.
                </span>
              </label>
              {consent && (
                <div>
                  <label htmlFor="granter-name" className="block text-[11px] uppercase tracking-wider text-white/45 mb-1">
                    Consent given by
                  </label>
                  <input
                    id="granter-name"
                    type="text"
                    value={granter}
                    onChange={(e) => setGranter(e.target.value)}
                    placeholder="Name of person or guardian granting consent"
                    className="glass-input w-full rounded-xl px-4 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Inline save error */}
            {saveError && (
              <div className="glass-amber rounded-xl px-4 py-3 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-amber-300/90 leading-relaxed">{saveError}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-auto">
              {/* Cancel */}
              <button
                onClick={handleClose}
                disabled={saving}
                className="flex-1 glass px-4 py-2.5 rounded-xl text-sm font-semibold text-white/45 hover:text-white/65 hover:bg-white/[0.06] transition-all disabled:opacity-30"
              >
                Cancel
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex-[2] btn-teal px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span>Save Person</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
