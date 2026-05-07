'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function SettingsPage() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [alertDays, setAlertDays] = useState(3);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/alerts/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.alert_days) setAlertDays(d.alert_days); })
      .catch(() => {});
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/alerts/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ alert_days: alertDays }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(data.message ?? 'Save failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';
  const cardBg   = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)';

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm font-dm-sans" style={{ color: textSoft }}>
          ← Dashboard
        </Link>
        <h1 className="text-xl font-serif font-bold" style={{ color: textMain }}>Settings</h1>
      </div>

      <div
        className="rounded-2xl p-5"
        style={{ background: cardBg, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}
      >
        <h2 className="text-sm font-semibold font-dm-sans mb-1" style={{ color: textMain }}>
          Absence Alert Threshold
        </h2>
        <p className="text-xs font-dm-sans mb-4" style={{ color: textSoft }}>
          Show a reminder banner when a person hasn't been seen for this many days.
        </p>

        <div className="flex items-center gap-4">
          <input
            type="range" min={1} max={30} value={alertDays}
            onChange={(e) => setAlertDays(parseInt(e.target.value, 10))}
            className="flex-1"
            aria-label="Alert threshold in days"
          />
          <span className="text-sm font-bold font-dm-sans w-16 text-right" style={{ color: '#C9943A' }}>
            {alertDays} {alertDays === 1 ? 'day' : 'days'}
          </span>
        </div>

        {error && <p className="text-xs text-red-400 font-dm-sans mt-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
