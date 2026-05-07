'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

interface OverduePerson {
  name:       string;
  relation:   string;
  days_since: number | null;
}

export default function AlertBanner() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [overdue,   setOverdue]   = useState<OverduePerson[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/alerts/check', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.overdue) setOverdue(d.overdue);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  if (dismissed || overdue.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{
            background:   dark ? 'rgba(246,173,85,0.10)' : 'rgba(246,173,85,0.15)',
            borderBottom: '1px solid rgba(246,173,85,0.30)',
          }}
        >
          <svg className="w-4 h-4 shrink-0" style={{ color: '#f6ad55' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="flex-1 text-xs font-dm-sans" style={{ color: dark ? '#fbd38d' : '#92400e' }}>
            <span className="font-semibold">Reminder: </span>
            {overdue.length === 1
              ? `${overdue[0].name.charAt(0).toUpperCase() + overdue[0].name.slice(1)} (${overdue[0].relation || 'person'}) hasn't been seen${overdue[0].days_since != null ? ` in ${overdue[0].days_since} day${overdue[0].days_since !== 1 ? 's' : ''}` : ' yet'}.`
              : `${overdue.length} people haven't been seen recently: ${overdue.map((p) => p.name).join(', ')}.`
            }
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-xs font-dm-sans font-medium"
            style={{ color: dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)' }}
            aria-label="Dismiss alert"
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
