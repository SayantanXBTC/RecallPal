import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import BubblesBackground from '@/components/landing/BubblesBackground';
import '../globals.css';

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
  title:       'RecallPal — Remember What Matters',
  description: 'Compassionate AI memory companion for dementia patients and their families.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${playfair.variable} ${dmSans.variable} font-dm-sans marketing-root`}>
      <BubblesBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
