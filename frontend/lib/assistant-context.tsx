'use client';

/**
 * Global snapshot of what's happening on-screen, published to the
 * AssistantPanel so its replies can reference the current situation
 * (who is on camera, which page, etc.). Also exposes UI handles so
 * the assistant can trigger flows on the user's behalf (e.g. open
 * the "Add Person" modal after saying "Want me to save them?").
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MultiRecognitionResult } from '@/lib/types';

interface AssistantContextValue {
  faces:         MultiRecognitionResult['faces'];
  peopleCount:   number;
  page:          string;
  hasUnknown:    boolean;
  publishFaces:  (r: MultiRecognitionResult) => void;
  publishPeople: (n: number) => void;
  publishPage:   (p: string) => void;
  onAddPerson?:  () => void;
  onAddPhotos?:  (name: string) => void;
  bindHandlers:  (h: { onAddPerson?: () => void; onAddPhotos?: (name: string) => void }) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [faces,       setFaces]       = useState<MultiRecognitionResult['faces']>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [page,        setPage]        = useState<string>('dashboard');
  const [handlers,    setHandlers]    = useState<{ onAddPerson?: () => void; onAddPhotos?: (name: string) => void }>({});

  const publishFaces  = useCallback((r: MultiRecognitionResult) => setFaces(r.faces ?? []), []);
  const publishPeople = useCallback((n: number) => setPeopleCount(n), []);
  const publishPage   = useCallback((p: string) => setPage(p), []);
  const bindHandlers  = useCallback((h: typeof handlers) => setHandlers(h), []);

  const hasUnknown = faces.some((f) => f.status !== 'recognized');

  const value = useMemo<AssistantContextValue>(() => ({
    faces, peopleCount, page, hasUnknown,
    publishFaces, publishPeople, publishPage,
    onAddPerson: handlers.onAddPerson,
    onAddPhotos: handlers.onAddPhotos,
    bindHandlers,
  }), [faces, peopleCount, page, hasUnknown, publishFaces, publishPeople, publishPage, handlers, bindHandlers]);

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>');
  return ctx;
}
