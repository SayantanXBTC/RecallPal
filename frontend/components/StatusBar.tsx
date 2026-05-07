'use client';

import { useEffect, useState } from 'react';
import { HealthStatus } from '@/lib/types';

export default function StatusBar() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error();
      const data: HealthStatus = await res.json();
      setHealth(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="glass border-t border-white/5 px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/40">
      {/* Backend connection */}
      <StatusDot
        active={!error && !loading}
        label={loading ? 'Connecting…' : error ? 'Backend offline' : 'Backend online'}
        color={error ? 'amber' : 'teal'}
      />

      {/* Face DB */}
      {health && (
        <StatusDot
          active={health.face_db_loaded}
          label={
            health.face_db_loaded
              ? `Face DB — ${health.people_count} ${health.people_count === 1 ? 'person' : 'people'}`
              : 'Face DB not loaded'
          }
          color="teal"
        />
      )}

      {/* Memory mode */}
      {health && (
        <StatusDot
          active={health.memory_backend === 'supabase'}
          label="Memory — Supabase"
          color="teal"
        />
      )}

      <span className="ml-auto opacity-30 tracking-wider uppercase text-[10px]">
        dementia-assist v0.1
      </span>
    </footer>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function StatusDot({
  active,
  label,
  color,
}: {
  active: boolean;
  label: string;
  color: 'teal' | 'amber';
}) {
  const dotColor = active
    ? color === 'teal'
      ? 'bg-teal-400'
      : 'bg-amber-400'
    : 'bg-white/20';

  const ringColor = active
    ? color === 'teal'
      ? 'bg-teal-400'
      : 'bg-amber-400'
    : 'bg-transparent';

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center w-2.5 h-2.5">
        <span className={`relative z-10 w-2 h-2 rounded-full ${dotColor}`} />
        {active && (
          <span
            className={`absolute w-2 h-2 rounded-full ${ringColor} animate-ping opacity-60`}
          />
        )}
      </div>
      <span>{label}</span>
    </div>
  );
}
