'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import CameraPanel    from '@/components/CameraPanel';
import AddPersonModal from '@/components/AddPersonModal';
import AddPhotosModal from '@/components/AddPhotosModal';
import PeopleSidebar  from '@/components/PeopleSidebar';
import Avatar         from '@/components/Avatar';
import { useAssistant } from '@/lib/assistant-context';
import { MultiRecognitionResult } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import AlertBanner from '@/components/AlertBanner';
import AccessibilityPanel from '@/components/AccessibilityPanel';

const IDLE_RESULT: MultiRecognitionResult = { faces: [] };

export default function DashboardPage() {
  const { logout, user, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  const [result,           setResult]           = useState<MultiRecognitionResult>(IDLE_RESULT);
  const [isModalOpen,      setIsModalOpen]      = useState(false);
  const [addPhotosFor,     setAddPhotosFor]     = useState<string | null>(null);
  const [isMuted,          setIsMuted]          = useState(false);
  const [refreshPeople,    setRefreshPeople]    = useState(0);
  // Cache of names we've already offered an add-photos prompt for this session
  // — prevents the button from re-triggering rate-limited toasts if the user
  // dismisses. The DB-side embeddings persist across sessions independently
  // via Supabase, so nothing here needs to survive reload.
  const suggestedRef = useRef<Set<string>>(new Set());

  // Set of trackIds we've already announced this session so a face that
  // stays on screen doesn't get re-announced every recognition tick.
  const spokenIdsRef = useRef<Set<number>>(new Set());
  const spokenQueueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);

  // ─── Voice output — per-person announcement queue ──────────────────────────

  const speakNext = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;
    if (isMuted) { spokenQueueRef.current = []; speakingRef.current = false; return; }
    if (speakingRef.current) return;
    const text = spokenQueueRef.current.shift();
    if (!text) { speakingRef.current = false; return; }
    speakingRef.current = true;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1.0; u.volume = 1.0;
    u.onend = () => { speakingRef.current = false; speakNext(); };
    u.onerror = () => { speakingRef.current = false; speakNext(); };
    window.speechSynthesis.speak(u);
  }, [isMuted]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const faces = result.faces ?? [];
    const currentIds = new Set(
      faces
        .filter(f => f.status === 'recognized' && f.name && typeof f.trackId === 'number')
        .map(f => f.trackId as number),
    );
    // Forget faces that have left frame so they can be re-announced next visit.
    for (const id of Array.from(spokenIdsRef.current)) {
      if (!currentIds.has(id)) spokenIdsRef.current.delete(id);
    }
    // Queue announcements for newly recognized faces this frame.
    for (const face of faces) {
      const tid = face.trackId;
      if (face.status !== 'recognized' || !face.name || typeof tid !== 'number') continue;
      if (spokenIdsRef.current.has(tid)) continue;
      spokenIdsRef.current.add(tid);
      const relation = face.memory?.relation?.trim();
      const line = relation
        ? `This is ${face.name}, your ${relation}.`
        : `This is ${face.name}.`;
      spokenQueueRef.current.push(line);
    }
    speakNext();
  }, [result, speakNext]);

  useEffect(() => {
    if (isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      spokenQueueRef.current = [];
      speakingRef.current = false;
    }
  }, [isMuted]);

  const { publishFaces, publishPage, publishPeople, bindHandlers } = useAssistant();

  useEffect(() => { publishPage('camera'); }, [publishPage]);
  useEffect(() => { publishFaces(result); }, [result, publishFaces]);
  useEffect(() => {
    if (!token) return;
    fetch('/api/people', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => publishPeople((d?.people?.length ?? 0)))
      .catch(() => {});
  }, [token, refreshPeople, publishPeople]);
  useEffect(() => {
    bindHandlers({
      onAddPerson: () => setIsModalOpen(true),
      onAddPhotos: (name) => setAddPhotosFor(name),
    });
  }, [bindHandlers]);

  const handleRecognition = useCallback((r: MultiRecognitionResult) => setResult(r), []);
  const handlePersonAdded = useCallback((name: string) => {
    setRefreshPeople((n) => n + 1);
    void name;
  }, []);

  const handleSignOut = () => logout();

  // Theme-aware tokens
  const headerBg   = dark ? 'rgba(18,14,9,0.80)'  : 'rgba(255,255,255,0.75)';
  const headerBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.70)';
  const textMain   = dark ? '#F5EFE8'  : '#3A2F28';
  const textSoft   = dark ? '#8A7D72'  : '#9A8C84';

  return (
    <div className="min-h-screen flex flex-col" style={{ minHeight: '100vh' }}>
      <AlertBanner />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 sticky top-0 z-40"
        style={{
          background:    headerBg,
          backdropFilter: 'blur(20px)',
          borderBottom:  `1px solid ${headerBorder}`,
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 select-none">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', boxShadow: '0 2px 8px rgba(201,148,58,0.35)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6z"/>
              <polyline points="9 3 9 9 15 9"/>
              <line x1="12" y1="13" x2="12" y2="17"/>
              <line x1="10" y1="15" x2="14" y2="15"/>
            </svg>
          </div>
          <span
            className="font-serif text-lg font-bold leading-none"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            RecallPal
          </span>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-3">

          {/* Accessibility */}
          <AccessibilityPanel />

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="relative rounded-full transition-all duration-300 focus:outline-none shrink-0 flex items-center"
            style={{ 
              width: 44, 
              height: 22,
              background: dark ? 'linear-gradient(135deg,#C9943A,#F0C97A)' : 'rgba(0,0,0,0.14)' 
            }}
          >
            <motion.span
              className="absolute rounded-full shadow-sm"
              style={{
                width: 18,
                height: 18,
                left: 2,
                background: dark ? 'white' : '#FAF6F1', 
                border: dark ? 'none' : '1px solid rgba(0,0,0,0.10)' 
              }}
              animate={{ x: dark ? 22 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>

          {/* Mute toggle */}
          <button
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
            title={isMuted ? 'Voice announcements: off' : 'Voice announcements: on'}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 hover:scale-105"
            style={{
              background: isMuted
                ? dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                : 'rgba(201,148,58,0.12)',
              border: `1px solid ${isMuted
                ? dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
                : 'rgba(201,148,58,0.30)'}`,
              color: isMuted ? textSoft : '#C9943A',
            }}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <line x1="17" y1="14" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                <line x1="17" y1="10" x2="21" y2="14" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-4.243-2.757A8 8 0 012 12a8 8 0 015.757-7.757M19.071 4.929A10 10 0 0112 2a10 10 0 00-7.071 2.929" />
              </svg>
            )}
          </button>

          {/* Daily summary link */}
          <Link
            href="/summary"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0"
            style={{
              background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              color: textSoft,
            }}
            aria-label="Daily summary"
            title="Daily summary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} strokeLinecap="round" />
              <line x1="8"  y1="2" x2="8"  y2="6" strokeWidth={2} strokeLinecap="round" />
              <line x1="3"  y1="10" x2="21" y2="10" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </Link>

          {/* Profile avatar — quick way into Settings (replaces gear icon) */}
          <Link href="/settings" title={user?.display_name || user?.email || 'Profile'}
            className="shrink-0 hover:scale-105 transition-transform">
            <Avatar src={user?.avatar_url} name={user?.display_name || user?.email} size={32} ring />
          </Link>

          {/* Sign out — bordered pill, sits at header height */}
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-semibold font-dm-sans transition-all hover:shadow-warm-sm"
            style={{
              background: dark ? 'rgba(201,148,58,0.08)' : 'rgba(255,255,255,0.75)',
              border:     `1px solid ${dark ? 'rgba(201,148,58,0.35)' : 'rgba(201,148,58,0.30)'}`,
              color:      dark ? '#F0C97A' : '#C9943A',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden" style={{ minHeight: 0 }}>

        {/* Camera — left, 65% */}
        <section className="lg:flex-[65] flex flex-col p-4 min-w-0">
          {/* Section label */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
            <span className="text-xs font-semibold uppercase tracking-widest font-dm-sans" style={{ color: textSoft }}>
              Live Camera
            </span>
          </div>
          <div className="flex-1" style={{ minHeight: 420 }}>
            <CameraPanel
              onRecognition={handleRecognition}
              currentResult={result}
              onAddRequest={() => setIsModalOpen(true)}
              onAddPhotosRequest={(name) => {
                suggestedRef.current.add(name.toLowerCase());
                setAddPhotosFor(name);
              }}
            />
          </div>
        </section>

        {/* Divider */}
        <div
          className="hidden lg:block w-px self-stretch"
          style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', margin: '1rem 0' }}
        />

        {/* People sidebar — right, 35% */}
        <aside
          className="lg:flex-[35] flex flex-col overflow-hidden"
          style={{ minWidth: 0, maxWidth: '100%' }}
        >
          {/* Section label */}
          <div className="flex items-center gap-2 px-4 pt-4 mb-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
            <span className="text-xs font-semibold uppercase tracking-widest font-dm-sans" style={{ color: textSoft }}>
              People
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <PeopleSidebar
              refreshTrigger={refreshPeople}
              onAddPerson={() => setIsModalOpen(true)}
            />
          </div>
        </aside>
      </main>

      {/* ── Slim status bar ───────────────────────────────────────────────── */}
      <footer
        className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-t"
        style={{
          background: dark ? 'rgba(18,14,9,0.60)' : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(12px)',
          borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9943A' }} />
          <span className="text-[11px] font-dm-sans" style={{ color: textSoft }}>RecallPal v1.0</span>
        </div>
        <span className="text-[11px] font-dm-sans" style={{ color: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)' }}>
          {(() => {
            const recognized = (result.faces ?? []).filter(f => f.status === 'recognized' && f.name);
            const unknowns   = (result.faces ?? []).filter(f => f.status !== 'recognized');
            if (recognized.length > 0) return `Recognized: ${recognized.map(f => f.name).join(', ')}`;
            if (unknowns.length > 0)   return 'Unknown face detected';
            if ((result.faces ?? []).length === 0 && result !== IDLE_RESULT) return 'No face in frame';
            return 'Waiting for camera…';
          })()}
        </span>
        <span className="ml-auto text-[11px] font-dm-sans" style={{ color: textSoft }}>
          {(() => {
            const recognized = (result.faces ?? []).filter(f => f.status === 'recognized' && f.name);
            if (recognized.length === 0) return <span className="font-medium" style={{ color: textMain }}>—</span>;
            const avg = Math.round(recognized.reduce((s, f) => s + (f.confidence ?? 0), 0) / recognized.length * 100);
            return <><span className="font-medium" style={{ color: textMain }}>{avg}%</span>{' confidence'}</>;
          })()}
        </span>
      </footer>

      {/* ── Add person modal ─────────────────────────────────────────────── */}
      <AddPersonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handlePersonAdded}
      />

      {/* ── Add more photos to an existing person (triggered from face card) */}
      <AddPhotosModal
        isOpen={addPhotosFor !== null}
        personName={addPhotosFor ?? ''}
        onClose={() => setAddPhotosFor(null)}
        onSuccess={() => {
          setAddPhotosFor(null);
          setRefreshPeople((n) => n + 1);
        }}
      />
    </div>
  );
}
