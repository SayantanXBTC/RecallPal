'use client';

import { AssistantProvider } from '@/lib/assistant-context';
import AssistantPanel from '@/components/AssistantPanel';
import { useAuth } from '@/lib/auth-context';

/**
 * Mounts JARVIS on every screen. The context provider is always
 * present so pages can publish state without conditional imports,
 * but the panel itself only renders once the user is signed in —
 * unauthenticated calls to /api/assistant/chat would 401 anyway.
 */
export default function AssistantMount({ children }: { children: React.ReactNode }) {
  return (
    <AssistantProvider>
      {children}
      <MaybePanel />
    </AssistantProvider>
  );
}

function MaybePanel() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <AssistantPanel />;
}
