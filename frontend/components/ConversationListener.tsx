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
    if (!SRClass) {
      console.log('[listener] Web Speech Recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (!active) { shouldRun.current = false; try { recRef.current?.stop(); } catch { /* ignore */ } return; }

    shouldRun.current = true;
    console.log('[listener] starting speech capture. Grant microphone permission if prompted.');

    const start = () => {
      if (!shouldRun.current) return;
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

          // Attribute the utterance to EVERY known face on screen right
          // now. If a group is present we can't tell who spoke, so
          // broadcast the memory — each person's card gets the snippet
          // and the caregiver can review per person later.
          const knownFaces = (facesRef.current || []).filter(
            (f) => f.status === 'recognized' && f.name,
          );
          if (knownFaces.length === 0) {
            console.log('[listener] heard but no known face — discarded:', text);
            continue;
          }
          const t = tokenRef.current;
          if (!t) { console.warn('[listener] no auth token — skip'); return; }

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
        // Chrome auto-stops after ~30s of silence; restart while we're
        // supposed to be listening.
        if (shouldRun.current) {
          try { start(); } catch { /* ignore */ }
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        const kind = e?.error || 'unknown';
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          console.warn('[listener] microphone permission denied. Allow the mic in browser settings and reload.');
          shouldRun.current = false;
          return;
        }
        // 'no-speech', 'aborted', 'network' — restart quietly.
        console.log('[listener] transient error, restarting:', kind);
        if (shouldRun.current) {
          setTimeout(() => { try { start(); } catch { /* ignore */ } }, 600);
        }
      };

      recRef.current = rec;
      try { rec.start(); } catch (err) { console.warn('[listener] start() threw:', err); }
    };

    start();
    return () => {
      shouldRun.current = false;
      try { recRef.current?.stop(); } catch { /* ignore */ }
    };
  }, [active]);

  return null;
}
