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

export default function VisitHistory({ refreshTrigger = 0 }: VisitHistoryProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const [events,        setEvents]        = useState<RecognitionEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [clearing,      setClearing]      = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/events?limit=50', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setEvents(d.events ?? []); })
        .catch(() => { if (!cancelled) setEvents([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    setLoading(true);
    load();
    // Refresh every 15s so newly recorded visits appear without the
    // caregiver having to add/delete a person to bump refreshTrigger.
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [refreshTrigger, token]);

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
      {/* Header row with clear button */}
      {!loading && events.length > 0 && !confirmClear && (
        <div className="flex items-center justify-between px-3 pb-2 shrink-0">
          <span className="text-[11px] font-dm-sans" style={{ color: softColor }}>
            {events.length} recent visits
          </span>
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[11px] font-semibold font-dm-sans px-2.5 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: 'rgba(239,68,68,0.70)' }}
          >
            Clear All
          </button>
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
          <p className="text-sm font-dm-sans" style={{ color: softColor }}>
            No visits recorded yet
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
