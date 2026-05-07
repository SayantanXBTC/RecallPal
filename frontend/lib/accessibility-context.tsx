'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type FontSize = 'normal' | 'large' | 'xl';

interface AccessibilityContextValue {
  fontSize:       FontSize;
  highContrast:   boolean;
  setFontSize:    (s: FontSize) => void;
  toggleContrast: () => void;
}

const A11Y_FONT_KEY     = 'rp_font_size';
const A11Y_CONTRAST_KEY = 'rp_high_contrast';

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontSize,     setFontSizeState]     = useState<FontSize>('normal');
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    const savedFont     = localStorage.getItem(A11Y_FONT_KEY) as FontSize | null;
    const savedContrast = localStorage.getItem(A11Y_CONTRAST_KEY);
    if (savedFont)     setFontSizeState(savedFont);
    if (savedContrast) setHighContrastState(savedContrast === 'true');
  }, []);

  // Apply CSS variables to <html> so all rem-based sizes scale automatically
  useEffect(() => {
    const scales: Record<FontSize, string> = { normal: '16px', large: '19px', xl: '22px' };
    document.documentElement.style.setProperty('font-size', scales[fontSize]);
    localStorage.setItem(A11Y_FONT_KEY, fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    localStorage.setItem(A11Y_CONTRAST_KEY, String(highContrast));
  }, [highContrast]);

  const setFontSize    = useCallback((s: FontSize) => setFontSizeState(s), []);
  const toggleContrast = useCallback(() => setHighContrastState((c) => !c), []);

  return (
    <AccessibilityContext.Provider value={{ fontSize, highContrast, setFontSize, toggleContrast }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used inside <AccessibilityProvider>.');
  return ctx;
}
