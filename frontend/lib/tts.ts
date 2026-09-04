/**
 * Shared TTS helpers. Picks a female English voice when the browser
 * exposes one — voice list is asynchronous in Chrome/Edge, so we cache
 * the pick and refresh it on 'voiceschanged'.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceReady = false;

const FEMALE_HINTS = [
  'female',
  'samantha',       // macOS
  'victoria',       // macOS
  'karen',          // macOS AU
  'moira',          // macOS IE
  'tessa',          // macOS ZA
  'susan',
  'zira',           // Windows
  'aria',           // Windows / Edge natural
  'jenny',
  'emma',
  'natasha',
  'clara',
  'libby',
  'olivia',
  'sonia',
  'google uk english female',
  'google us english',   // Google US default is female
];

function isEnglish(v: SpeechSynthesisVoice): boolean {
  return (v.lang || '').toLowerCase().startsWith('en');
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const nm = (v.name || '').toLowerCase();
  let score = 0;
  for (let i = 0; i < FEMALE_HINTS.length; i++) {
    if (nm.includes(FEMALE_HINTS[i])) { score = 100 - i; break; }
  }
  if ((v.lang || '').toLowerCase().startsWith('en-us')) score += 3;
  if ((v.lang || '').toLowerCase().startsWith('en-gb')) score += 2;
  if (v.localService) score += 1;   // local voices are more consistent
  return score;
}

function pick(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const english = voices.filter(isEnglish);
  const pool    = english.length ? english : voices;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of pool) {
    const s = scoreVoice(v);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best;
}

export function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (cachedVoice) return cachedVoice;
  cachedVoice = pick();
  if (!voiceReady) {
    voiceReady = true;
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      const v = pick();
      if (v) cachedVoice = v;
    });
  }
  return cachedVoice;
}

export function speakWithFemaleVoice(text: string, opts: { rate?: number; pitch?: number; volume?: number } = {}): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (!text) return null;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = getPreferredVoice();
    if (v) u.voice = v;
    u.rate   = opts.rate   ?? 0.95;
    u.pitch  = opts.pitch  ?? 1.05;
    u.volume = opts.volume ?? 1.0;
    window.speechSynthesis.speak(u);
    return u;
  } catch {
    return null;
  }
}

export function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try { window.speechSynthesis.cancel(); } catch { /* no-op */ }
}
