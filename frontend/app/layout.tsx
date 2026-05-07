import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Playfair_Display, DM_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { AccessibilityProvider } from '@/lib/accessibility-context';
import { ThemeProvider } from '@/lib/theme-context';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets:  ['latin'],
  weight:   ['300', '400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display:  'swap',
});

const playfair = Playfair_Display({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800', '900'],
  style:    ['normal', 'italic'],
  variable: '--font-playfair',
  display:  'swap',
});

const dmSans = DM_Sans({
  subsets:  ['latin'],
  weight:   ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display:  'swap',
});

export const metadata: Metadata = {
  title: 'RecallPal — Remember What Matters',
  description: 'AI-powered memory companion for dementia care',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${playfair.variable} ${dmSans.variable}`}>
      <body><AccessibilityProvider><AuthProvider><ThemeProvider>{children}</ThemeProvider></AuthProvider></AccessibilityProvider></body>
    </html>
  );
}
