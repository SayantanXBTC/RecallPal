'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Person } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import VisitHistory from '@/components/VisitHistory';
import AddPhotosModal from '@/components/AddPhotosModal';

interface PeopleSidebarProps {
  refreshTrigger: number;
  onAddPerson: () => void;
}

const RELATIONS = [
  'Son', 'Daughter', 'Husband', 'Wife', 'Partner',
  'Father', 'Mother', 'Brother', 'Sister',
  'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
  'Friend', 'Neighbour', 'Caregiver', 'Doctor', 'Nurse', 'Other',
];

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase();
}

function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

interface EditState {
  relation: string;
  notes:    string;
  age:      string;
  likes:    string[];
  likeInput: string;
}

function PersonCard({
  person,
  dark,
  onUpdated,
  onDeleted,
  onAddPhotos,
}: {
  person: Person;
  dark: boolean;
  onUpdated: () => void;
  onDeleted: (name: string) => void;
  onAddPhotos: (name: string) => void;
}) {
  const { token } = useAuth();
  const hue = nameHue(person.name);
  const [editing,        setEditing]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);
  const [edit,    setEdit]      = useState<EditState>({
    relation:  person.relation || '',
    notes:     person.notes    || '',
    age:       person.age != null ? String(person.age) : '',
    likes:     person.likes    || [],
    likeInput: '',
  });

  const openEdit = () => {
    setEdit({
      relation:  person.relation || '',
      notes:     person.notes    || '',
      age:       person.age != null ? String(person.age) : '',
      likes:     person.likes    || [],
      likeInput: '',
    });
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/update-person', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:    JSON.stringify({
          name:     person.name,
          relation: edit.relation,
          notes:    edit.notes,
          age:      edit.age.trim() ? parseInt(edit.age, 10) : null,
          likes:    edit.likes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setEditing(false);
        onUpdated();
      } else {
        setError(data.message ?? 'Update failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/delete-person', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: person.name }),
      });
      if (res.ok) {
        // Optimistic: remove from local list immediately, don't wait for re-fetch
        onDeleted(person.name);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? `Delete failed (${res.status})`);
        setConfirmDelete(false);
        setDeleting(false);
      }
    } catch {
      setError('Connection error — try again');
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  const addLike = () => {
    const tag = edit.likeInput.trim().replace(/,$/, '');
    if (tag && !edit.likes.includes(tag)) {
      setEdit((e) => ({ ...e, likes: [...e.likes, tag], likeInput: '' }));
    } else {
      setEdit((e) => ({ ...e, likeInput: '' }));
    }
  };

  // theme-aware input style
  const inputStyle: React.CSSProperties = {
    background:   dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)',
    border:       `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
    color:        dark ? '#F5EFE8' : '#3A2F28',
    borderRadius: '0.75rem',
    padding:      '0.45rem 0.75rem',
    fontSize:     '0.82rem',
    width:        '100%',
    outline:      'none',
    fontFamily:   'var(--font-dm-sans)',
  };

  return (
    <div
      className="group rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-warm-md"
      style={{
        background:   dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
        border:       `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.80)'}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Person row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 font-dm-sans"
          style={{
            background: `hsla(${hue},55%,${dark ? 22 : 88}%,0.9)`,
            border:     `1.5px solid hsla(${hue},60%,50%,0.35)`,
            color:      `hsl(${hue},65%,${dark ? 68 : 38}%)`,
          }}
        >
          {initials(person.name)}
        </div>

        {/* Name + relation */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight font-dm-sans"
             style={{ color: dark ? '#F5EFE8' : '#3A2F28' }}>
            {person.name}
          </p>
          {person.relation && (
            <p className="text-xs truncate leading-tight font-dm-sans"
               style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>
              {person.relation}
            </p>
          )}
        </div>

        {/* Action cluster — collapses to icons on hover / touch */}
        <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
        {/* Edit toggle */}
        <button
          onClick={editing ? () => setEditing(false) : openEdit}
          className="w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0"
          style={{
            background:  editing
              ? 'rgba(201,148,58,0.15)'
              : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            border:      `1px solid ${editing ? 'rgba(201,148,58,0.35)' : dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
            color:       editing ? '#C9943A' : dark ? '#8A7D72' : '#9A8C84',
          }}
          aria-label={editing ? 'Close edit' : 'Edit person'}
        >
          {editing ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
        </button>

        {/* Add photos button */}
        <button
          onClick={() => onAddPhotos(person.name)}
          className="w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0"
          style={{
            background: dark ? 'rgba(201,148,58,0.08)' : 'rgba(201,148,58,0.08)',
            border: '1px solid rgba(201,148,58,0.20)',
            color: 'rgba(201,148,58,0.70)',
          }}
          aria-label="Add more photos"
          title="Add more photos to improve recognition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Delete button */}
        <button
          onClick={() => { setConfirmDelete(true); setEditing(false); }}
          className="w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0"
          style={{
            background: dark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
            border:     '1px solid rgba(239,68,68,0.18)',
            color:      'rgba(239,68,68,0.60)',
          }}
          aria-label="Delete person"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        </div>
      </div>

      {/* Delete confirmation panel */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 py-3 flex items-center justify-between gap-3"
              style={{ borderTop: `1px solid rgba(239,68,68,0.18)`, background: 'rgba(239,68,68,0.05)' }}
            >
              <p className="text-xs font-dm-sans" style={{ color: dark ? '#fca5a5' : '#dc2626' }}>
                Remove <span className="font-semibold">{person.name}</span>? This cannot be undone.
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-dm-sans"
                  style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: dark ? '#8A7D72' : '#9A8C84' }}
                >Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-dm-sans flex items-center gap-1 transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
                >
                  {deleting ? (
                    <span className="w-2.5 h-2.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  ) : 'Delete'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit panel (animated) */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 flex flex-col gap-3"
              style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` }}
            >
              <div className="pt-3" />

              {/* Relation */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium font-dm-sans"
                       style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>Relationship</label>
                <select
                  value={edit.relation}
                  onChange={(e) => setEdit((s) => ({ ...s, relation: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">Select…</option>
                  {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Age */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium font-dm-sans"
                       style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>Age</label>
                <input
                  type="number" min={1} max={130}
                  value={edit.age}
                  onChange={(e) => setEdit((s) => ({ ...s, age: e.target.value }))}
                  placeholder="e.g. 68"
                  style={inputStyle}
                />
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium font-dm-sans"
                       style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>Notes</label>
                <textarea
                  rows={2}
                  value={edit.notes}
                  onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
                  placeholder="Things to remember…"
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>

              {/* Likes */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium font-dm-sans"
                       style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>Interests</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={edit.likeInput}
                    onChange={(e) => setEdit((s) => ({ ...s, likeInput: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLike(); } }}
                    placeholder="Add interest, Enter"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={addLike}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold font-dm-sans shrink-0"
                    style={{ background: 'rgba(201,148,58,0.15)', color: '#C9943A', border: '1px solid rgba(201,148,58,0.30)' }}
                  >+</button>
                </div>
                {edit.likes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {edit.likes.map((like) => (
                      <span key={like}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-dm-sans"
                            style={{ background: 'rgba(201,148,58,0.10)', color: '#C9943A', border: '1px solid rgba(201,148,58,0.20)' }}>
                        {like}
                        <button
                          onClick={() => setEdit((s) => ({ ...s, likes: s.likes.filter((l) => l !== like) }))}
                          className="hover:text-red-400 transition-colors"
                          aria-label={`Remove ${like}`}
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <p className="text-[11px] text-red-400 font-dm-sans">{error}</p>
              )}

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2 rounded-xl text-xs font-semibold font-dm-sans flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white', boxShadow: '0 3px 12px rgba(201,148,58,0.30)' }}
              >
                {saving ? (
                  <>
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PeopleSidebar({ refreshTrigger, onAddPerson }: PeopleSidebarProps) {
  const { theme }  = useTheme();
  const { token, loading: authLoading } = useAuth();
  const dark       = theme === 'dark';
  const [people,         setPeople]         = useState<Person[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refresh,        setRefresh]        = useState(0);
  const [activeTab,      setActiveTab]      = useState<'people' | 'history'>('people');
  const [addPhotosPerson, setAddPhotosPerson] = useState<string | null>(null);

  const reload = () => setRefresh((n) => n + 1);

  const removePerson = (name: string) => {
    setPeople((prev) => prev.filter((p) => p.name.toLowerCase() !== name.toLowerCase()));
  };

  useEffect(() => {
    // Wait for auth context to hydrate from localStorage before fetching.
    // Avoids a spurious unauthenticated request on first render.
    if (authLoading) return;

    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      setLoading(true);
      fetch('/api/people', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (r) => {
          const text = await r.text();
          try { return JSON.parse(text); } catch { return { people: [] }; }
        })
        .then((d) => {
          if (!cancelled) setPeople(d.people ?? []);
        })
        .catch(() => {
          if (!cancelled) setPeople([]);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    load();

    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [refreshTrigger, refresh, token, authLoading]);

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Tab bar + header */}
      <div className="flex flex-col shrink-0 px-3 pt-3 pb-0">
        {/* Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-3"
          style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
        >
          {(['people', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold font-dm-sans transition-all capitalize"
              style={{
                background: activeTab === tab
                  ? dark ? 'rgba(201,148,58,0.18)' : 'white'
                  : 'transparent',
                color: activeTab === tab ? '#C9943A' : dark ? '#8A7D72' : '#9A8C84',
                boxShadow: activeTab === tab
                  ? dark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)'
                  : 'none',
              }}
            >
              {tab === 'people' ? 'People' : 'Visit Log'}
            </button>
          ))}
        </div>

        {/* People tab header row */}
        {activeTab === 'people' && (
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest font-dm-sans" style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>
              {people.length} enrolled
            </span>
            <button
              onClick={onAddPerson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold font-dm-sans transition-all"
              style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white', boxShadow: '0 2px 10px rgba(201,148,58,0.30)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'history' ? (
        <VisitHistory refreshTrigger={refreshTrigger} />
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5"
             style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,148,58,0.25) transparent' }}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                   style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }} />
            </div>
          )}

          {!loading && people.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                   style={{ background: 'rgba(201,148,58,0.08)', border: '1.5px dashed rgba(201,148,58,0.25)' }}>
                <svg className="w-7 h-7" style={{ color: 'rgba(201,148,58,0.40)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium font-dm-sans" style={{ color: dark ? '#C4B09A' : '#6B5C52' }}>
                  No people enrolled yet
                </p>
                <p className="text-xs font-dm-sans mt-0.5" style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>
                  Tap Add to get started
                </p>
              </div>
            </div>
          )}

          {!loading && people.map((person) => (
            <motion.div
              key={person.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <PersonCard
                person={person}
                dark={dark}
                onUpdated={reload}
                onDeleted={removePerson}
                onAddPhotos={(name) => setAddPhotosPerson(name)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Rendered outside motion wrappers to avoid fixed-position stacking context trap */}
      <AddPhotosModal
        isOpen={addPhotosPerson !== null}
        personName={addPhotosPerson ?? ''}
        onClose={() => setAddPhotosPerson(null)}
        onSuccess={() => {
          setAddPhotosPerson(null);
          reload();
        }}
      />
    </div>
  );
}
