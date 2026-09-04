'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Avatar from '@/components/Avatar';
import { Bell, User, Palette, ShieldCheck, LogOut, Trash2, Upload, X } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { user, token, logout, updateProfile, updateAvatar, removeAvatar } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState('');
  const [alertDays,   setAlertDays]   = useState(3);
  const [saving,      setSaving]      = useState<'profile'|'alerts'|'avatar'|null>(null);
  const [status,      setStatus]      = useState<{kind:'ok'|'err'; text:string} | null>(null);
  const [confirmErase,setConfirmErase]= useState(false);
  const [erasing,     setErasing]     = useState(false);

  useEffect(() => { setDisplayName(user?.display_name ?? ''); }, [user?.display_name]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/alerts/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.alert_days) setAlertDays(d.alert_days); })
      .catch(() => {});
  }, [token]);

  const flash = (kind: 'ok'|'err', text: string) => {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 2800);
  };

  const saveProfile = async () => {
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 80) { flash('err', 'Name must be 1–80 characters.'); return; }
    setSaving('profile');
    try {
      await updateProfile(trimmed);
      flash('ok', 'Name updated.');
    } catch (e) { flash('err', (e as Error).message || 'Save failed.'); }
    finally { setSaving(null); }
  };

  const saveAlerts = async () => {
    setSaving('alerts');
    try {
      const res  = await fetch('/api/alerts/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ alert_days: alertDays }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Save failed');
      flash('ok', 'Alert threshold saved.');
    } catch (e) { flash('err', (e as Error).message); }
    finally { setSaving(null); }
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { flash('err', 'Please pick an image file.'); return; }
    if (file.size > 512 * 1024)          { flash('err', 'Image must be under 512 KB.'); return; }
    setSaving('avatar');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload  = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('Could not read file.'));
        fr.readAsDataURL(file);
      });
      await updateAvatar(dataUrl);
      flash('ok', 'Profile picture updated.');
    } catch (err) { flash('err', (err as Error).message || 'Upload failed.'); }
    finally {
      setSaving(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAvatar = async () => {
    setSaving('avatar');
    try {
      await removeAvatar();
      flash('ok', 'Profile picture removed.');
    } catch (e) { flash('err', (e as Error).message); }
    finally { setSaving(null); }
  };

  const eraseAccount = async () => {
    setErasing(true);
    try {
      const res  = await fetch('/api/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Erase failed.');
      logout();
      router.replace('/');
    } catch (e) { flash('err', (e as Error).message); setErasing(false); }
  };

  // ─── Style tokens ─────────────────────────────────────────────────────────
  const textMain   = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft   = dark ? '#8A7D72' : '#9A8C84';
  const cardBg     = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)';
  const cardBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const inputBg    = dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.9)';
  const dangerBg   = dark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)';

  const isGoogleAvatar = !!user?.avatar_url && !user.avatar_url.startsWith('data:');

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm font-dm-sans hover:underline" style={{ color: textSoft }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-serif font-bold" style={{ color: textMain }}>Settings</h1>
      </div>

      {/* Toast */}
      {status && (
        <div
          className="mb-4 rounded-xl px-4 py-2.5 text-sm font-dm-sans"
          style={{
            background: status.kind === 'ok' ? 'rgba(129,230,217,0.16)' : 'rgba(246,173,85,0.14)',
            border: `1px solid ${status.kind === 'ok' ? 'rgba(79,209,197,0.35)' : 'rgba(246,173,85,0.40)'}`,
            color: status.kind === 'ok' ? '#0f766e' : '#b45309',
          }}
        >
          {status.text}
        </div>
      )}

      <div className="grid gap-5">

        {/* ─── Profile ────────────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2 mb-4">
            <User size={18} style={{ color: '#C9943A' }} />
            <h2 className="text-sm font-semibold font-dm-sans tracking-wide uppercase" style={{ color: textMain }}>Profile</h2>
          </div>

          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center gap-2">
              <Avatar src={user?.avatar_url} name={user?.display_name || user?.email} size={72} ring />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={saving === 'avatar' || isGoogleAvatar}
                  title={isGoogleAvatar ? 'Managed by Google — sign out to change.' : 'Upload a photo'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
                  style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${cardBorder}`, color: textSoft }}
                >
                  <Upload size={14} />
                </button>
                {user?.avatar_url && !isGoogleAvatar && (
                  <button
                    type="button"
                    onClick={clearAvatar}
                    disabled={saving === 'avatar'}
                    title="Remove picture"
                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: textSoft }}>Email</label>
                <p className="text-sm font-dm-sans truncate" style={{ color: textMain }}>{user?.email || '—'}</p>
              </div>
              <div>
                <label htmlFor="display-name" className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: textSoft }}>Display name</label>
                <div className="flex gap-2">
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="flex-1 rounded-xl px-3 py-2 text-sm font-dm-sans outline-none"
                    style={{ background: inputBg, border: `1px solid ${cardBorder}`, color: textMain }}
                  />
                  <button
                    onClick={saveProfile}
                    disabled={saving === 'profile' || displayName.trim() === (user?.display_name ?? '')}
                    className="px-4 rounded-xl text-xs font-semibold font-dm-sans disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}
                  >
                    {saving === 'profile' ? '…' : 'Save'}
                  </button>
                </div>
              </div>
              {isGoogleAvatar && (
                <p className="text-[11px] font-dm-sans" style={{ color: textSoft }}>
                  Picture synced from your Google account.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ─── Appearance ─────────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2 mb-4">
            <Palette size={18} style={{ color: '#C9943A' }} />
            <h2 className="text-sm font-semibold font-dm-sans tracking-wide uppercase" style={{ color: textMain }}>Appearance</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold font-dm-sans" style={{ color: textMain }}>Theme</p>
              <p className="text-xs font-dm-sans" style={{ color: textSoft }}>Currently: {dark ? 'Dark — soft on the eyes at night' : 'Light — bright and airy'}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 rounded-full text-xs font-semibold font-dm-sans transition-all"
              style={{
                background: dark ? 'rgba(240,201,122,0.10)' : 'rgba(0,0,0,0.05)',
                border:     `1px solid ${dark ? 'rgba(240,201,122,0.35)' : 'rgba(0,0,0,0.10)'}`,
                color:      dark ? '#F0C97A' : '#3A2F28',
              }}
            >
              Switch to {dark ? 'Light' : 'Dark'}
            </button>
          </div>
        </section>

        {/* ─── Absence alerts ─────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} style={{ color: '#C9943A' }} />
            <h2 className="text-sm font-semibold font-dm-sans tracking-wide uppercase" style={{ color: textMain }}>Absence reminders</h2>
          </div>
          <p className="text-xs font-dm-sans mb-4" style={{ color: textSoft }}>
            Show a gentle banner when a familiar face hasn&apos;t been seen for a while.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="range" min={1} max={30} value={alertDays}
              onChange={(e) => setAlertDays(parseInt(e.target.value, 10))}
              className="flex-1 accent-yellow-500"
              aria-label="Alert threshold in days"
            />
            <span className="text-sm font-bold font-dm-sans w-20 text-right" style={{ color: '#C9943A' }}>
              {alertDays} {alertDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          <button
            onClick={saveAlerts}
            disabled={saving === 'alerts'}
            className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold font-dm-sans transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}
          >
            {saving === 'alerts' ? 'Saving…' : 'Save threshold'}
          </button>
        </section>

        {/* ─── Privacy / data ─────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} style={{ color: '#C9943A' }} />
            <h2 className="text-sm font-semibold font-dm-sans tracking-wide uppercase" style={{ color: textMain }}>Privacy &amp; data</h2>
          </div>
          <ul className="space-y-2 text-sm font-dm-sans" style={{ color: textMain }}>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#C9943A' }} />
              Your face data is scoped to your account only — no other user can see it.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#C9943A' }} />
              Consent is recorded per enrolled person and can be revoked from the API.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#C9943A' }} />
              Every enrol / delete / erase action is written to an audit log you can inspect.
            </li>
          </ul>
        </section>

        {/* ─── Sign out ───────────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold font-dm-sans" style={{ color: textMain }}>Sign out</p>
              <p className="text-xs font-dm-sans" style={{ color: textSoft }}>End your current session on this browser.</p>
            </div>
            <button
              onClick={() => { logout(); router.replace('/login'); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold font-dm-sans"
              style={{ background: 'rgba(201,148,58,0.10)', border: '1px solid rgba(201,148,58,0.35)', color: '#C9943A' }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </section>

        {/* ─── Danger zone ────────────────────────────────────────────────── */}
        <section className="rounded-2xl p-6" style={{ background: dangerBg, border: '1px solid rgba(239,68,68,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={18} style={{ color: '#ef4444' }} />
            <h2 className="text-sm font-semibold font-dm-sans tracking-wide uppercase" style={{ color: '#ef4444' }}>Danger zone</h2>
          </div>
          <p className="text-xs font-dm-sans mb-4" style={{ color: textSoft }}>
            Delete your account and every face, memory, consent and audit row associated with it. This cannot be undone.
          </p>
          {confirmErase ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-dm-sans" style={{ color: '#ef4444' }}>
                Are you absolutely sure?
              </span>
              <button
                onClick={eraseAccount}
                disabled={erasing}
                className="px-4 py-2 rounded-xl text-xs font-semibold font-dm-sans disabled:opacity-50"
                style={{ background: '#ef4444', color: 'white' }}
              >
                {erasing ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setConfirmErase(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold font-dm-sans"
                style={{ background: 'rgba(0,0,0,0.06)', color: textSoft }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmErase(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold font-dm-sans"
              style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444' }}
            >
              Delete my account
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
