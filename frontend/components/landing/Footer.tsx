'use client';

import { useTheme } from '@/lib/theme-context';

export default function Footer() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <footer
      className="py-8 text-center border-t"
      style={{
        background: dark ? 'rgba(18,14,8,0.80)' : 'rgba(255,255,255,0.40)',
        backdropFilter: 'blur(12px)',
        borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      }}
    >
      <p
        className="font-dm-sans text-sm"
        style={{ color: dark ? '#7A6E64' : '#9A8C84' }}
      >
        © {new Date().getFullYear()} RecallPal. Built with care for families everywhere.
      </p>
    </footer>
  );
}
