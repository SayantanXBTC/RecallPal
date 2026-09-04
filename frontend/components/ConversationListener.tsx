'use client';

/**
 * Continuous room-mic listener. While the dashboard is mounted, we keep
 * a Web Speech Recognition session open, batch each final utterance, and
 * POST it to /api/conversations attributed to whichever known face is
 * currently on screen.
 *
 * Only ONE recognizer runs per browser tab, regardless of how many
 * times React re-mounts this component (strict mode double-invoke,
 * navigation, etc.). All coordination lives in module-level state so
 * the mount/unmount lifecycle can't spawn duplicate instances.
 */

import { useEffect, useRef } from 'react';
import { useAssistant } from '@/lib/assistant-context';
import { useAuth }      from '@/lib/auth-context';
import type { MultiRecognitionResult } from '@/lib/types';

interface Props {
  /** Only listen when true (usually mirrors camera on/off). */
  active: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

// ─── Module-level singleton state ────────────────────────────────────────────
// One recognizer per tab. Refs held here so remounts don't leak instances.
let g_rec: SR | null = null;
let g_shouldRun = false;
let g_started   = false;   // set once user has granted mic + kick fired
let g_facesRef: { current: MultiRecognitionResult['faces'] } = { current: [] };
let g_tokenRef: { current: string | null }                  = { current: null };
let g_restartScheduled = false;
let g_kickListenerAttached = false;

async function requestMicOnce(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    console.warn('[listener] microphone permission was refused:', err);
    return false;
  }
}

function scheduleRestart() {
  if (g_restartScheduled || !g_shouldRun) return;
  g_restartScheduled = true;
  setTimeout(() => {
    g_restartScheduled = false;
    if (g_shouldRun) startRec();
  }, 900);
}

function startRec() {
  if (typeof window === 'undefined') return;
  if (g_rec) return;   // already running
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SRClass: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SRClass) return;

  const rec: SR = new SRClass();
  rec.lang            = 'en-US';
  rec.continuous      = true;
  rec.interimResults  = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => console.log('[listener] mic open, listening…');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    const results = e.results;
    for (let i = e.resultIndex; i < results.length; i++) {
      const r = results[i];
      if (!r.isFinal) continue;
      const text = (r[0]?.transcript || '').trim();
      if (!text || text.length < 3) continue;

      const knownFaces = (g_facesRef.current || []).filter(
        (f) => f.status === 'recognized' && f.name,
      );
      if (knownFaces.length === 0) {
        console.log('[listener] heard but no known face — discarded:', text);
        continue;
      }
      const t = g_tokenRef.current;
      if (!t) { console.warn('[listener] no auth token — skip'); continue; }

      const names = knownFaces.map((f) => f.name).join(', ');
      console.log(`[listener] saving for ${names}:`, text);
      for (const face of knownFaces) {
        void fetch('/api/conversations', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body:    JSON.stringify({ person_name: face.name, transcript: text }),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn('[listener] save failed', face.name, res.status, body);
          }
        }).catch((err) => console.warn('[listener] save fetch error', face.name, err));
      }
    }
  };

  rec.onend = () => {
    g_rec = null;
    if (g_shouldRun) scheduleRestart();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onerror = (e: any) => {
    const kind = e?.error || 'unknown';
    if (kind === 'not-allowed' || kind === 'service-not-allowed') {
      console.warn('[listener] microphone permission denied.');
      g_shouldRun = false;
      return;
    }
    if (kind === 'aborted') return;   // expected on stop()
    console.log('[listener] transient error:', kind);
  };

  g_rec = rec;
  try { rec.start(); } catch (err) { console.warn('[listener] start() threw:', err); g_rec = null; }
}

async function attachKickListener() {
  if (g_kickListenerAttached) return;
  g_kickListenerAttached = true;

  const kick = async () => {
    if (g_started || !g_shouldRun) return;
    g_started = true;
    window.removeEventListener('pointerdown', kick, true);
    window.removeEventListener('keydown',     kick, true);
    console.log('[listener] user gesture — requesting microphone…');
    const ok = await requestMicOnce();
    if (!ok) { g_shouldRun = false; return; }
    console.log('[listener] mic permission granted — starting speech recognition.');
    startRec();
  };
  window.addEventListener('pointerdown', kick, true);
  window.addEventListener('keydown',     kick, true);
}

export default function ConversationListener({ active }: Props) {
  const { faces } = useAssistant();
  const { token } = useAuth();

  const facesRef  = useRef(faces);
  const tokenRef  = useRef(token);

  useEffect(() => { facesRef.current = faces; g_facesRef = facesRef; }, [faces]);
  useEffect(() => { tokenRef.current = token; g_tokenRef = tokenRef; }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) {
      console.log('[listener] Web Speech Recognition not supported here. Try Chrome or Edge.');
      return;
    }

    if (!active) {
      // Leave singleton alone across brief remounts; only tear down on
      // explicit deactivation of the listener.
      return;
    }

    if (!g_shouldRun) {
      g_shouldRun = true;
      console.log('[listener] armed — will start speech capture on your first click.');
    }
    void attachKickListener();

    // Deliberately no teardown here — the module-level singleton
    // outlives strict-mode remounts. It is only shut down when
    // `active` explicitly flips to false (rare — we could add that
    // path later if the dashboard exposes a listen-off toggle).
  }, [active]);

  return null;
}
