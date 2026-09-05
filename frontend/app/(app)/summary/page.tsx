// frontend/app/(app)/summary/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { DailySummary, VisitorSummaryEntry } from '@/lib/types';

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "morning", "afternoon", "evening", "night" — plain English window. */
function partOfDay(iso: string | null): string {
  if (!iso) return '';
  try {
    const h = new Date(iso).getHours();
    if (h < 5)  return 'late at night';
    if (h < 12) return 'in the morning';
    if (h < 17) return 'in the afternoon';
    if (h < 21) return 'in the evening';
    return 'at night';
  } catch { return ''; }
}

/** "10:31 am" — friendly clock time, lowercase, no leading zero on hour. */
function clockTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso)
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase()
      .replace(/\s+/g, ' ');
  } catch { return ''; }
}

/** "once", "twice", "three times", "four times", "many times" — human count. */
function timesPhrase(n: number): string {
  if (n <= 1) return 'once';
  if (n === 2) return 'twice';
  if (n === 3) return 'three times';
  if (n === 4) return 'four times';
  if (n <= 8) return `${n} times`;
  return 'many times';
}

function humanRelation(rel: string): string {
  return rel ? rel.toLowerCase() : '';
}

function VisitorCard({ entry, dark }: { entry: VisitorSummaryEntry; dark: boolean }) {
  const capName    = entry.person_name.charAt(0).toUpperCase() + entry.person_name.slice(1);
  const textMain   = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft   = dark ? '#8A7D72' : '#6B5C52';
  const initial    = capName[0] || '?';

  const firstWord = partOfDay(entry.first_seen);
  const lastWord  = partOfDay(entry.last_seen);
  const firstClk  = clockTime(entry.first_seen);
  const lastClk   = clockTime(entry.last_seen);
  const single    = entry.first_seen === entry.last_seen || firstClk === lastClk;

  // "…from 10:31 am until 10:29 pm" — anchor the sentence in a real
  // time window so the reader can place the visit in their day.
  const seenLine = single
    ? `They came by ${firstWord} at ${firstClk}.`
    : `First seen ${firstWord} at ${firstClk}, and again ${lastWord} at ${lastClk}.`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="rounded-3xl p-6 flex gap-5 items-start shadow-warm-md"
      style={{
        background:     dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.92)',
        border:         `1px solid ${dark ? 'rgba(201,148,58,0.20)' : 'rgba(201,148,58,0.20)'}`,
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-white text-2xl font-serif font-bold"
        style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', boxShadow: '0 4px 14px rgba(201,148,58,0.35)' }}
        aria-hidden
      >
        {initial}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <p className="font-serif leading-snug" style={{ color: textMain, fontSize: '1.35rem' }}>
          <span style={{ color: '#C9943A', fontWeight: 700 }}>{capName}</span>
          {entry.relation && (
            <>, your <span style={{ color: '#C9943A', fontWeight: 700 }}>{humanRelation(entry.relation)}</span></>
          )}
          , visited you {timesPhrase(entry.visit_count)}.
        </p>

        <p className="font-dm-sans text-base" style={{ color: textSoft }}>
          {seenLine}
        </p>

        {entry.notes && entry.notes.trim().length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 mt-3"
            style={{
              background: dark ? 'rgba(201,148,58,0.06)' : 'rgba(201,148,58,0.06)',
              border:     '1px solid rgba(201,148,58,0.18)',
            }}
          >
            <p className="font-dm-sans text-sm leading-relaxed" style={{ color: textMain }}>
              <span style={{ color: '#C9943A', fontWeight: 700 }}>Remember: </span>
              {entry.notes}
            </p>
          </div>
        )}

        {entry.likes && entry.likes.length > 0 && (
          <p className="font-dm-sans text-sm" style={{ color: textSoft }}>
            They love {(() => {
              const items = entry.likes.slice(0, 3).map((l) => l.toLowerCase());
              if (items.length === 1) return items[0];
              if (items.length === 2) return `${items[0]} and ${items[1]}`;
              return `${items[0]}, ${items[1]} and ${items[2]}`;
            })()}.
          </p>
        )}
      </div>
    </motion.article>
  );
}

export default function SummaryPage() {
  const { token }       = useAuth();
  const { theme }       = useTheme();
  const dark            = theme === 'dark';

  const todayStr        = toLocalDateStr(new Date());
  const [date, setDate] = useState(todayStr);
  const [summary,  setSummary]  = useState<DailySummary | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const fetchSummary = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const tzOff = -new Date().getTimezoneOffset();  // minutes east of UTC
      const res = await fetch(`/api/summary?date=${d}&tz_offset_min=${tzOff}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Request failed');
      setSummary(data as DailySummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSummary(date); }, [date, fetchSummary]);

  const bg        = dark ? '#0D0A06' : '#FAF6F1';
  const headerBg  = dark ? 'rgba(18,14,9,0.82)' : 'rgba(255,255,255,0.82)';
  const border    = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const textMain  = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft  = dark ? '#8A7D72' : '#6B5C52';

  const isToday   = date === todayStr;
  const niceDate  = new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const total = summary?.total_visitors ?? 0;
  const heading = loading
    ? 'Looking…'
    : total === 0
      ? (isToday ? 'A quiet day so far.' : 'A quiet day.')
      : total === 1
        ? (isToday ? 'You had one visitor today.' : 'One person came by.')
        : (isToday ? `You had ${total} visitors today.` : `${total} people came by.`);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bg }}>
      {/* Soft header */}
      <header
        className="shrink-0 flex items-center gap-4 px-6 py-4 sticky top-0 z-40"
        style={{ background: headerBg, backdropFilter: 'blur(18px)', borderBottom: `1px solid ${border}` }}
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-dm-sans transition-all"
          style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: textSoft }}
          aria-label="Back to the camera"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <span className="font-serif font-bold" style={{ color: textMain, fontSize: '1.35rem' }}>
          Today&apos;s visits
        </span>

        <div className="ml-auto flex items-center gap-2">
          {date !== todayStr && (
            <button
              onClick={() => setDate(todayStr)}
              className="rounded-full px-3 py-2 text-xs font-semibold font-dm-sans"
              style={{ background: 'rgba(201,148,58,0.14)', border: '1px solid rgba(201,148,58,0.35)', color: '#C9943A' }}
            >
              Today
            </button>
          )}
          {/* Large, obvious date picker pill with icon + label. */}
          <label
            className="relative inline-flex items-center gap-2 rounded-full pl-4 pr-3 py-2 cursor-pointer transition-all hover:shadow-warm-sm overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(201,148,58,0.15), rgba(240,201,122,0.10))',
              border:     '1px solid rgba(201,148,58,0.40)',
              color:      textMain,
            }}
            title="Choose a different day"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9943A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2"  x2="16" y2="6" />
              <line x1="8"  y1="2"  x2="8"  y2="6" />
              <line x1="3"  y1="10" x2="21" y2="10" />
            </svg>
            <span className="font-dm-sans text-sm font-semibold select-none">
              {new Date(date + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}
            </span>
            <input
              type="date"
              value={date}
              max={todayStr}
              onChange={e => setDate(e.target.value)}
              aria-label="Choose a day"
              className="sr-only-native"
              style={{
                position: 'absolute',
                opacity: 0,
                inset: 0,
                width: '100%',
                height: '100%',
                cursor: 'pointer',
              }}
            />
          </label>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        {/* Warm heading block */}
        <section className="mb-8 text-center">
          <p className="font-dm-sans text-sm uppercase tracking-widest mb-2" style={{ color: '#C9943A' }}>
            {niceDate}
          </p>
          <h1 className="font-serif leading-snug" style={{ color: textMain, fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)' }}>
            {heading}
          </h1>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(201,148,58,0.40)', borderTopColor: '#C9943A' }} />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl px-4 py-3 text-sm font-dm-sans text-center" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {!loading && !error && summary && summary.visitors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(201,148,58,0.08)', border: '2px dashed rgba(201,148,58,0.30)' }}
            >
              <svg className="w-12 h-12" style={{ color: '#C9943A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <p className="font-serif text-lg" style={{ color: textMain }}>
              No one came by this day.
            </p>
            <p className="font-dm-sans text-sm" style={{ color: textSoft, maxWidth: 320 }}>
              When someone you know visits, they will show up here so you can look back.
            </p>
          </div>
        )}

        {!loading && !error && summary && summary.visitors.length > 0 && (
          <div className="flex flex-col gap-5">
            {summary.visitors.map((entry) => (
              <VisitorCard key={`${entry.person_name}-${entry.first_seen}`} entry={entry} dark={dark} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
