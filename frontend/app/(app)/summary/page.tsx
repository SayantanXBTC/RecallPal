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

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function VisitorCard({ entry, dark }: { entry: VisitorSummaryEntry; dark: boolean }) {
  const hue     = nameHue(entry.person_name);
  const capName = entry.person_name.charAt(0).toUpperCase() + entry.person_name.slice(1);
  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
        border:         `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm"
          style={{ background: `hsl(${hue},55%,48%)` }}
        >
          {capName.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-serif font-bold text-base leading-tight truncate"
              style={{ color: textMain }}
            >
              {capName}
            </span>
            {entry.relation && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-dm-sans shrink-0"
                style={{
                  background: 'rgba(201,148,58,0.14)',
                  border:     '1px solid rgba(201,148,58,0.30)',
                  color:      '#C9943A',
                }}
              >
                {entry.relation}
              </span>
            )}
          </div>
          <span className="text-[11px] font-dm-sans" style={{ color: textSoft }}>
            {formatTime(entry.first_seen)}
            {entry.first_seen !== entry.last_seen && ` → ${formatTime(entry.last_seen)}`}
          </span>
        </div>

        <div
          className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold font-dm-sans"
          style={{
            background: 'rgba(201,148,58,0.12)',
            border:     '1px solid rgba(201,148,58,0.25)',
            color:      '#C9943A',
          }}
        >
          {entry.visit_count}×
        </div>
      </div>

      {/* Likes */}
      {entry.likes && entry.likes.length > 0 && (
        <div>
          <p className="text-[10px] font-dm-sans uppercase tracking-wider mb-1.5" style={{ color: textSoft }}>
            Likes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entry.likes.map((like, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full text-xs font-dm-sans"
                style={{
                  background: dark ? 'rgba(201,148,58,0.10)' : 'rgba(201,148,58,0.08)',
                  border:     '1px solid rgba(201,148,58,0.22)',
                  color:      '#C9943A',
                }}
              >
                {like}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes / things to remember */}
      {entry.notes && entry.notes.trim().length > 0 && (
        <div
          className="rounded-xl px-3 py-2.5"
          style={{
            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            border:     `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          <p className="text-[10px] font-dm-sans uppercase tracking-wider mb-1" style={{ color: textSoft }}>
            Remember
          </p>
          <p className="text-xs font-dm-sans leading-relaxed" style={{ color: textMain }}>
            {entry.notes}
          </p>
        </div>
      )}
    </motion.div>
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
      const res = await fetch(`/api/summary?date=${d}`, {
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

  // Theme tokens
  const bg         = dark ? '#0D0A06'               : '#FAF6F1';
  const headerBg   = dark ? 'rgba(18,14,9,0.82)'    : 'rgba(255,255,255,0.78)';
  const borderCol  = dark ? 'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.07)';
  const textMain   = dark ? '#F5EFE8'                : '#3A2F28';
  const textSoft   = dark ? '#8A7D72'                : '#9A8C84';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bg }}>
      {/* Header */}
      <header
        className="shrink-0 flex items-center gap-3 px-5 py-3 sticky top-0 z-40"
        style={{ background: headerBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${borderCol}` }}
      >
        <Link
          href="/dashboard"
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all"
          style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `1px solid ${borderCol}`, color: textSoft }}
          aria-label="Back to dashboard"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
          <span className="font-serif font-bold text-lg" style={{ color: textMain }}>Daily Summary</span>
        </div>

        <div className="ml-auto">
          <input
            type="date"
            value={date}
            max={todayStr}
            onChange={e => setDate(e.target.value)}
            aria-label="Select date"
            className="rounded-xl px-3 py-1.5 text-xs font-dm-sans outline-none"
            style={{
              background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              border:     `1px solid ${borderCol}`,
              color:      textMain,
            }}
          />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full">
        {/* Stats row — only show when no error */}
        {summary && !loading && !error && (
          <div className="flex gap-3 mb-5">
            {/* Date card */}
            <div
              className="flex-1 rounded-2xl px-4 py-3"
              style={{
                background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
                border:         `1px solid ${borderCol}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: textSoft }}>Date</p>
              <p className="text-sm font-bold font-dm-sans" style={{ color: textMain }}>
                {new Date(summary.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>

            {/* Visitors card */}
            <div
              className="flex-1 rounded-2xl px-4 py-3"
              style={{
                background:     dark ? 'rgba(201,148,58,0.08)' : 'rgba(201,148,58,0.07)',
                border:         '1px solid rgba(201,148,58,0.22)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: '#C9943A' }}>Visitors</p>
              <p className="text-2xl font-bold font-serif leading-none" style={{ color: '#C9943A' }}>
                {summary.total_visitors}
              </p>
            </div>

            {/* Most frequent */}
            {summary.visitors.length > 0 && (
              <div
                className="flex-1 rounded-2xl px-4 py-3"
                style={{
                  background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
                  border:         `1px solid ${borderCol}`,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: textSoft }}>Most seen</p>
                <p className="text-sm font-bold font-serif truncate" style={{ color: textMain }}>
                  {summary.visitors[0].person_name.charAt(0).toUpperCase() + summary.visitors[0].person_name.slice(1)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(201,148,58,0.40)', borderTopColor: '#C9943A' }} />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-2xl px-4 py-3 text-sm font-dm-sans" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && summary && summary.visitors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ border: `2px dashed ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}` }}
            >
              <svg className="w-8 h-8" style={{ color: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
            <p className="text-sm font-dm-sans" style={{ color: textSoft }}>No visitors recognised on this day</p>
          </div>
        )}

        {/* Visitor cards */}
        {!loading && !error && summary && summary.visitors.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
              <span className="text-xs font-semibold uppercase tracking-widest font-dm-sans" style={{ color: textSoft }}>
                Visitors
              </span>
            </div>
            {summary.visitors.map((entry) => (
              <VisitorCard key={`${entry.person_name}-${entry.first_seen}`} entry={entry} dark={dark} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
