'use client';

/**
 * Continuous room-mic listener. While the camera is running, we keep a
 * Web Speech Recognition session open, batch each final utterance, and
 * POST it to /api/conversations attributed to whichever known face is
 * currently on screen. This is what powers the "Last time you spoke
 * about X" cue on the face card.
 *
 * We intentionally do NOT store snippets when the face is unknown or
 * no face is on screen — the whole point is per-person memory.
 */

import { useEffect, useRef } from 'react';
import { useAssistant } from '@/lib/assistant-context';
import { useAuth }      from '@/lib/auth-context';

interface Props {
  /** Only listen when true (usually mirrors camera on/off). */
  active: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export default function ConversationListener({ active }: Props) {
  const { faces } = useAssistant();
  const { token } = useAuth();

  const facesRef  = useRef(faces);
  const tokenRef  = useRef(token);
  const recRef    = useRef<SR | null>(null);
  const shouldRun = useRef(false);

  useEffect(() => { facesRef.current = faces; }, [faces]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;   // Firefox etc — silently no-op

    if (!active) { shouldRun.current = false; try { recRef.current?.stop(); } catch { /* ignore */ } return; }

    shouldRun.current = true;

    const start = () => {
      if (!shouldRun.current) return;
      const rec: SR = new SRClass();
      rec.lang            = 'en-US';
      rec.continuous      = true;
      rec.interimResults  = false;
      rec.maxAlternatives = 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        const results = e.results;
        for (let i = e.resultIndex; i < results.length; i++) {
          const r = results[i];
          if (!r.isFinal) continue;
          const text = (r[0]?.transcript || '').trim();
          if (!text || text.length < 3) continue;
          const recognized = (facesRef.current || []).find(
            (f) => f.status === 'recognized' && f.name,
          );
          if (!recognized?.name) continue;   // no known face -> discard
          const t = tokenRef.current;
          if (!t) continue;
          void fetch('/api/conversations', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body:    JSON.stringify({ person_name: recognized.name, transcript: text }),
          }).catch(() => {});
        }
      };

      rec.onend = () => {
        // Chrome auto-stops after ~30s of silence; restart while we're
        // supposed to be listening.
        if (shouldRun.current) {
          try { start(); } catch { /* ignore */ }
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (_e: any) => {
        // Common: 'no-speech', 'network', 'aborted'. Restart quietly.
        if (shouldRun.current) {
          setTimeout(() => { try { start(); } catch { /* ignore */ } }, 500);
        }
      };

      recRef.current = rec;
      try { rec.start(); } catch { /* already running */ }
    };

    start();
    return () => {
      shouldRun.current = false;
      try { recRef.current?.stop(); } catch { /* ignore */ }
    };
  }, [active]);

  return null;
}
