'use client';

export default function Footer() {
  return (
    <footer className="relative px-6 pb-10 pt-16">
      <div className="max-w-6xl mx-auto">
        <div className="horizon-line mb-10" />

        <div className="liquid-glass liquid-glass-subtle rounded-3xl px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(232,236,255,0.95), rgba(199,209,255,0.85))',
                boxShadow:  '0 3px 10px rgba(91,108,255,0.35), inset 0 1px 1px rgba(255,255,255,0.6)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A0C10" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6z"/>
                <polyline points="9 3 9 9 15 9"/>
              </svg>
            </span>
            <span className="font-inter text-sm font-medium text-white/80 tracking-tight">
              RecallPal
            </span>
          </div>

          <p className="font-inter font-light text-[0.85rem] text-white/50 text-center">
            © {new Date().getFullYear()} RecallPal. Built with care for families everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
