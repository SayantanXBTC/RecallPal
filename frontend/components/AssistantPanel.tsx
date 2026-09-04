'use client';

/**
 * Floating RecallPal helper.
 * - Bottom-right pulsing bubble; expands to a chat panel.
 * - Quick-action buttons for the common tasks.
 * - Free-form chat backed by /api/assistant/chat (Claude).
 * - Mic input via Web Speech API when available.
 * - Speaks replies via SpeechSynthesis (respects the dashboard mute).
 * - Nudges: when an unknown face appears, the bubble pulses and the
 *   first-open message pre-fills a "save this person?" prompt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Mic, Send, UserPlus, Volume2, VolumeX } from 'lucide-react';

/** Minimal calm face — used as both the trigger bubble icon and the
 *  header avatar. Big round eyes + gentle smile, no jargon-y robot vibe. */
function CalmFace({ size = 22, color = 'white' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.6" opacity="0.9" />
      <circle cx="8.5"  cy="10" r="1.3" fill={color} />
      <circle cx="15.5" cy="10" r="1.3" fill={color} />
      <path
        d="M8 14.5 Q12 17.5 16 14.5"
        stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}

const ASSISTANT_NAME = 'EDITH';
const ASSISTANT_TAGLINE = 'Always here for you';

/** Remove markdown syntax + special characters that TTS reads out
 *  literally ("asterisk asterisk name"). Keeps punctuation that speech
 *  synthesis handles naturally (comma, period, question mark). */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')        // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
    .replace(/\*([^*]+)\*/g, '$1')           // italic asterisks
    .replace(/__([^_]+)__/g, '$1')           // bold underscores
    .replace(/_([^_]+)_/g, '$1')             // italic underscores
    .replace(/~~([^~]+)~~/g, '$1')           // strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links -> text
    .replace(/^#{1,6}\s+/gm, '')             // headings
    .replace(/^\s*[-*+]\s+/gm, '')           // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '')           // numbered list markers
    .replace(/[*_~`>#|\\]/g, ' ')            // any leftover markdown chars
    .replace(/\s{2,}/g, ' ')                 // collapse whitespace
    .trim();
}
import { useAuth } from '@/lib/auth-context';
import { useAssistant } from '@/lib/assistant-context';
import { cancelSpeech, speakWithFemaleVoice } from '@/lib/tts';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const GREETING: ChatMsg = {
  role: 'assistant',
  content: `Hello, I am ${ASSISTANT_NAME}. I am here to help. Would you like to save someone new, or see who visited today?`,
};

const stopSpeech = cancelSpeech;

export default function AssistantPanel() {
  const { token } = useAuth();
  const { faces, peopleCount, page, hasUnknown, onAddPerson } = useAssistant();

  const [open,        setOpen]        = useState(false);
  const [messages,    setMessages]    = useState<ChatMsg[]>([GREETING]);
  const [input,       setInput]       = useState('');
  const [thinking,    setThinking]    = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [listening,   setListening]   = useState(false);
  const [available,   setAvailable]   = useState(true);
  const [pulseNudge,  setPulseNudge]  = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nudgedRef = useRef<boolean>(false);

  // Auto-scroll to latest reply.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  // Context-aware nudge: when an unknown face first appears on camera,
  // pulse the bubble to draw attention. Reset when the frame clears.
  useEffect(() => {
    if (hasUnknown && !nudgedRef.current) {
      nudgedRef.current = true;
      setPulseNudge(true);
      setTimeout(() => setPulseNudge(false), 6000);
    } else if (!hasUnknown) {
      nudgedRef.current = false;
    }
  }, [hasUnknown]);

  const speak = useCallback((text: string) => {
    if (muted) return;
    const cleaned = sanitizeForSpeech(text);
    if (!cleaned) return;
    cancelSpeech();
    speakWithFemaleVoice(cleaned, { rate: 0.95, pitch: 1.05 });
  }, [muted]);

  // Killswitch: mute or closing the panel drops queued speech.
  useEffect(() => { if (muted) stopSpeech(); }, [muted]);
  useEffect(() => { if (!open)  stopSpeech(); }, [open]);
  useEffect(() => () => stopSpeech(), []);   // unmount

  const send = useCallback(async (raw: string, extraContext?: Record<string, unknown>) => {
    const message = raw.trim();
    if (!message || thinking) return;
    setInput('');
    const nextHistory: ChatMsg[] = [...messages, { role: 'user', content: message }];
    setMessages(nextHistory);
    setThinking(true);
    try {
      const res = await fetch('/api/assistant/chat', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message,
          history: nextHistory.slice(-8),   // keep prompt short
          context: {
            faces,
            people_count: peopleCount,
            page,
            ...extraContext,
          },
        }),
      });
      if (res.status === 503) {
        setAvailable(false);
        setMessages((m) => [...m, {
          role: 'assistant',
          content: 'The helper is not turned on right now. You can still use every button on the screen.',
        }]);
        return;
      }
      const data = await res.json();
      const reply: string = data?.reply || 'I am here. What would you like to do?';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      speak(reply);
    } catch {
      setMessages((m) => [...m, {
        role: 'assistant',
        content: 'I could not reach the helper. Please try again in a moment.',
      }]);
    } finally {
      setThinking(false);
    }
  }, [messages, thinking, token, faces, peopleCount, page, speak]);

  // Web Speech Recognition
  const startListen = useCallback(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMessages((m) => [...m, { role: 'assistant', content: 'Your browser cannot listen. Please type your question.' }]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const heard: string = e.results?.[0]?.[0]?.transcript || '';
      setListening(false);
      if (heard) void send(heard);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    try { rec.start(); } catch { setListening(false); }
  }, [send]);

  const quickActions = useMemo(() => ([
    {
      icon:  <UserPlus size={14} />,
      label: hasUnknown ? 'Save this person' : 'Save someone new',
      run:   () => { setOpen(false); onAddPerson?.(); },
      disabled: !onAddPerson,
    },
    {
      icon:  <CalmFace size={14} color="#F0C97A" />,
      label: 'Who is here?',
      run:   () => void send('Who is on camera right now?'),
      disabled: false,
    },
    {
      icon:  <MessageCircle size={14} />,
      label: 'How do I use this?',
      run:   () => void send('Please walk me through the app in simple steps.'),
      disabled: false,
    },
  ]), [hasUnknown, onAddPerson, send]);

  return (
    <>
      {/* Floating bubble trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close helper' : 'Open helper'}
        title="RecallPal helper"
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-warm-md transition-transform hover:scale-105"
        style={{
          background: 'linear-gradient(135deg,#C9943A,#F0C97A)',
          boxShadow:  pulseNudge
            ? '0 0 0 6px rgba(201,148,58,0.15), 0 0 0 12px rgba(201,148,58,0.08), 0 6px 20px rgba(201,148,58,0.45)'
            : '0 6px 20px rgba(201,148,58,0.35)',
        }}
      >
        {open ? <X color="white" size={22} /> : <CalmFace size={26} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-24 right-5 z-50 w-[360px] max-w-[92vw] rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(20,16,10,0.94)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(201,148,58,0.30)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
              maxHeight: 'min(560px, 82vh)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)' }}>
                  <CalmFace size={18} />
                </div>
                <div>
                  <p className="font-serif text-sm text-white leading-tight">{ASSISTANT_NAME}</p>
                  <p className="font-dm-sans text-[10px] uppercase tracking-widest" style={{ color: 'rgba(240,201,122,0.8)' }}>
                    {ASSISTANT_TAGLINE}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMuted((m) => !m)}
                  title={muted ? 'Voice off' : 'Voice on'}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#F5EFE8' }}
                >
                  {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#F5EFE8' }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="px-3 py-2 flex flex-wrap gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.run}
                  disabled={a.disabled}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold font-dm-sans disabled:opacity-40"
                  style={{
                    background: 'rgba(201,148,58,0.14)',
                    border: '1px solid rgba(201,148,58,0.30)',
                    color: '#F0C97A',
                  }}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ minHeight: 200 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className="rounded-2xl px-3 py-2 text-sm font-dm-sans max-w-[85%]"
                  style={m.role === 'user'
                    ? { alignSelf: 'flex-end', marginLeft: 'auto', background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#F5EFE8', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  {m.content}
                </div>
              ))}
              {thinking && (
                <div className="rounded-2xl px-3 py-2 text-sm font-dm-sans max-w-[85%]" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(245,239,232,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Thinking…
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); void send(input); }}
              className="flex items-center gap-1.5 px-3 py-2 border-t"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <button
                type="button"
                onClick={startListen}
                title="Speak your question"
                disabled={thinking}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
                style={{
                  background: listening ? 'linear-gradient(135deg,#ef4444,#f87171)' : 'rgba(255,255,255,0.06)',
                  color: listening ? 'white' : '#F5EFE8',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Mic size={15} />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={available ? 'Type or press the microphone…' : 'Assistant is off — set ANTHROPIC_API_KEY.'}
                disabled={thinking || !available}
                className="flex-1 rounded-full px-3 py-2 text-sm font-dm-sans outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#F5EFE8',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
              <button
                type="submit"
                disabled={thinking || !input.trim() || !available}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}
                title="Send"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
