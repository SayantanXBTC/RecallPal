'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/lib/theme-context';
import { AssistantProvider } from '@/lib/assistant-context';
import AssistantPanel from '@/components/AssistantPanel';

function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    // Wait until localStorage has been read before deciding to redirect
    if (!loading && !token) router.replace('/login');
  }, [token, loading, router]);

  // Show spinner while rehydrating from localStorage OR when not yet authed
  if (loading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center marketing-root font-dm-sans">
        <div className="flex flex-col items-center gap-4">
          <span
            className="font-serif text-2xl font-bold"
            style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            RecallPal
          </span>
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
               style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }} />
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AssistantProvider>
        <div className="marketing-root font-dm-sans">
          {children}
        </div>
        <AssistantPanel />
      </AssistantProvider>
    </ToastProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppShell>{children}</AppShell>
    </ThemeProvider>
  );
}
