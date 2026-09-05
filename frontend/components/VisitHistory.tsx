'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RecognitionEvent } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

interface VisitHistoryProps {
  refreshTrigger?: number;
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function VisitHistory({ refreshTrigger = 0 }: VisitHistoryProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const todayStr = toLocalDate(new Date());
  const [date,          setDate]          = useState(todayStr);
  const [events,        setEvents]        = useState<RecognitionEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [clearing,      setClearing]      = useState(false);

  const isToday = date === todayStr;

  useEffect(() => {
    let cancelled = false;
    // Local day bounds so an event just after / before UTC midnight
    // still lands on the right day for the caregiver.
    const [y, m, d] = date.split('-').map(Number);
    const dayStart  = new Date(y, (m - 1), d, 0, 0, 0, 0).getTime();
    const dayEnd    = dayStart + 24 * 60 * 60 * 1000;

    const load = () => {
      // Ask for a big window and filter client-side. Backend still limits
      // to 200 rows, which is plenty for a day (throttle = 1/min/person).
      fetch(`/api/events?limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) console.warn('[visits] /api/events', r.status, body);
          return body;
        })
        .then((raw) => {
          if (cancelled) return;
          const all = Array.isArray(raw?.events) ? raw.events : [];
          const localFiltered = (all as RecognitionEvent[]).filter((ev) => {
            const t = new Date(ev.recognized_at).getTime();
            return t >= dayStart && t < dayEnd;
          });
          setEvents(localFiltered);
        })
        .catch((err) => {
          console.warn('[visits] fetch error', err);
          if (!cancelled) setEvents([]);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    setLoading(true);
    load();
    const timer = isToday ? setInterval(load, 20_000) : null;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [refreshTrigger, token, date, isToday]);

  // Auto-jump the picker to the new day when the clock rolls over.
  useEffect(() => {
    const check = () => {
      const now = toLocalDate(new Date());
      if (isToday && now !== todayStr) setDate(now);
    };
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [isToday, todayStr]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await fetch('/api/events', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setEvents([]);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  const softColor = dark ? '#8A7D72' : '#9A8C84';
  const textMain  = dark ? '#F5EFE8' : '#3A2F28';

  return (
    <div className="flex flex-col h-full">
      {/* Date picker row — always visible */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 shrink-0">
        <label
          className="relative inline-flex items-center gap-2 rounded-full pl-3 pr-2.5 py-1.5 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, rgba(201,148,58,0.15), rgba(240,201,122,0.10))',
            border:     '1px solid rgba(201,148,58,0.35)',
            color:      textMain,
          }}
          title="Choose a different day"
          onClick={(e) => {
            const inp = (e.currentTarget as HTMLLabelElement).querySelector('input[type=date]') as HTMLInputElement | null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (inp && typeof (inp as any).showPicker === 'function') {
              try { (inp as unknown as { showPicker: () => void }).showPicker(); } catch { /* no-op */ }
            }
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9943A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2"  x2="16" y2="6" />
            <line x1="8"  y1="2"  x2="8"  y2="6" />
            <line x1="3"  y1="10" x2="21" y2="10" />
          </svg>
          <span className="font-dm-sans text-xs font-semibold select-none">
            {new Date(date + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}
          </span>
          <input
            type="date"
            value={date}
            max={todayStr}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Choose a day"
            style={{ position: 'absolute', right: 4, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
        </label>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setDate(todayStr)}
              className="text-[11px] font-semibold font-dm-sans px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(201,148,58,0.12)', border: '1px solid rgba(201,148,58,0.30)', color: '#C9943A' }}
            >
              Today
            </button>
          )}
          {!loading && events.length > 0 && !confirmClear && (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[11px] font-semibold font-dm-sans px-2.5 py-1 rounded-lg transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: 'rgba(239,68,68,0.70)' }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>
      {!loading && events.length > 0 && !confirmClear && (
        <div className="px-3 pb-2 shrink-0">
          <span className="text-[11px] font-dm-sans italic" style={{ color: softColor }}>
            {events.length} {events.length === 1 ? 'visit' : 'visits'} {isToday ? 'today' : 'on this day'}
          </span>
        </div>
      )}

      {/* Confirm clear */}
      {confirmClear && (
        <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 shrink-0"
             style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <span className="text-xs font-dm-sans" style={{ color: dark ? '#fca5a5' : '#dc2626' }}>
            Delete all visit logs?
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-dm-sans"
              style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: softColor }}
            >Cancel</button>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-dm-sans flex items-center gap-1 disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
            >
              {clearing
                ? <span className="w-2.5 h-2.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }}
          />
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(201,148,58,0.08)', border: '1.5px dashed rgba(201,148,58,0.25)' }}
          >
            <svg className="w-6 h-6" style={{ color: 'rgba(201,148,58,0.40)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-dm-sans italic" style={{ color: softColor }}>
            {isToday ? 'No visits yet today.' : 'No one came by that day.'}
          </p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div
          className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,148,58,0.25) transparent' }}
        >
          {events.map((ev, i) => {
            const hue = nameHue(ev.person_name);
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, duration: 0.18 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                {/* Color dot */}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: `hsl(${hue},60%,55%)` }}
                />
                {/* Name */}
                <span
                  className="flex-1 text-sm font-semibold font-dm-sans capitalize truncate"
                  style={{ color: textMain }}
                >
                  {ev.person_name}
                </span>
                {/* Time */}
                <span
                  className="text-[11px] font-dm-sans shrink-0"
                  style={{ color: softColor }}
                >
                  {timeAgo(ev.recognized_at)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
