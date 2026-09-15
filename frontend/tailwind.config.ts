import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // App (dark) palette
        teal: { 300: '#81e6d9', 400: '#4fd1c5', 500: '#38b2ac' },
        amber: { 300: '#fbd38d', 400: '#f6ad55', 500: '#ed8936' },
        // Landing (warm) palette — retained for compat with existing app screens
        cream:  '#FAF6F1',
        sky:    '#D6E9F8',
        peach:  '#FDDFC4',
        gold: {
          DEFAULT: '#C9943A',
          light:   '#F0C97A',
          pale:    '#FDF3E0',
        },
        text: {
          dark: '#3A2F28',
          mid:  '#6B5C52',
          soft: '#9A8C84',
        },
        // Marketing cinematic palette
        ink: {
          950: '#050608',
          900: '#0A0C10',
          800: '#101319',
          700: '#171B23',
          600: '#1F2430',
        },
        mist: {
          50:  '#F5F7FA',
          200: '#D7DCE5',
          400: '#8892A6',
          600: '#4B5468',
        },
        aurora: {
          indigo: '#5B6CFF',
          violet: '#8A5BFF',
          cyan:   '#6BC9FF',
        },
      },
      fontFamily: {
        // App font
        sans:  ['var(--font-plus-jakarta)', 'system-ui', 'sans-serif'],
        // Landing fonts
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        'dm-sans': ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        // New marketing font
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #FAF6F1 0%, #EEF4FB 45%, #FDF0E8 100%)',
        'gold-gradient': 'linear-gradient(135deg, #C9943A 0%, #F0C97A 100%)',
        'ink-gradient':  'radial-gradient(1200px 700px at 50% -10%, rgba(91,108,255,0.18) 0%, transparent 55%), radial-gradient(900px 600px at 85% 110%, rgba(138,91,255,0.12) 0%, transparent 60%), linear-gradient(180deg, #05070C 0%, #08090F 40%, #05070C 100%)',
      },
      boxShadow: {
        'warm-sm': '0 4px 14px rgba(180,140,100,0.12)',
        'warm-md': '0 8px 32px rgba(180,140,100,0.16)',
        'warm-lg': '0 16px 48px rgba(180,140,100,0.20)',
        'gold':    '0 4px 20px rgba(201,148,58,0.35)',
        'glass':   '0 20px 60px -20px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.08)',
        'glow':    '0 0 40px rgba(91,108,255,0.18), 0 0 80px rgba(138,91,255,0.10)',
      },
      backdropBlur: {
        glass: '16px',
        '2xl': '40px',
      },
      animation: {
        'ping-slow':  'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float':      'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite reverse',
        'drift':      'drift 22s ease-in-out infinite',
        'drift-slow': 'drift 34s ease-in-out infinite reverse',
        'shimmer':    'shimmer 8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%':      { transform: 'translate3d(4%, -6%, 0) scale(1.06)' },
          '66%':      { transform: 'translate3d(-3%, 4%, 0) scale(0.96)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
