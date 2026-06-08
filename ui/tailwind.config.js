/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.01em' }],
        xs:    ['11px', { lineHeight: '16px' }],
        sm:    ['12px', { lineHeight: '18px' }],
        base:  ['13px', { lineHeight: '20px' }],
        md:    ['14px', { lineHeight: '22px' }],
      },
      colors: {
        // ── Core surface palette ─────────────────────────────────────────
        surface: {
          950: '#080c14',   // deepest bg
          900: '#0d1117',   // app bg
          850: '#111827',   // sidebar
          800: '#161d2e',   // panel
          750: '#1c2538',   // card
          700: '#232f45',   // elevated card
          600: '#2e3d55',   // border/divider
          500: '#3d5068',   // subtle hover
          400: '#556882',   // active hover
        },
        // ── Brand accent ─────────────────────────────────────────────────
        brand: {
          DEFAULT: '#6366f1',   // indigo-500
          light:   '#818cf8',   // indigo-400
          dim:     '#3730a3',   // indigo-800 (bg tints)
          glow:    'rgba(99,102,241,0.25)',
        },
        // ── Semantic ─────────────────────────────────────────────────────
        success: { DEFAULT: '#10b981', dim: 'rgba(16,185,129,0.15)', light: '#34d399' },
        danger:  { DEFAULT: '#f43f5e', dim: 'rgba(244,63,94,0.15)',  light: '#fb7185' },
        warning: { DEFAULT: '#f59e0b', dim: 'rgba(245,158,11,0.15)', light: '#fbbf24' },
        info:    { DEFAULT: '#38bdf8', dim: 'rgba(56,189,248,0.15)', light: '#7dd3fc' },
        // ── Text ─────────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#e2e8f0',
          muted:   '#64748b',
          faint:   '#334155',
          inverse: '#0f172a',
        },
        // ── Keep legacy tally.* aliases so existing screens don't break ──
        tally: {
          bg:        '#080c14',
          panel:     '#161d2e',
          accent:    '#232f45',
          highlight: '#6366f1',
          text:      '#e2e8f0',
          muted:     '#64748b',
          border:    '#2e3d55',
          green:     '#10b981',
          red:       '#f43f5e',
          yellow:    '#f59e0b',
          blue:      '#38bdf8',
        },
      },
      spacing: {
        '0.5': '2px',
        '1':   '4px',
        '1.5': '6px',
        '2':   '8px',
        '2.5': '10px',
        '3':   '12px',
      },
      borderRadius: {
        sm:  '4px',
        DEFAULT: '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '20px',
      },
      boxShadow: {
        glow:   '0 0 20px rgba(99,102,241,0.35)',
        'glow-sm': '0 0 10px rgba(99,102,241,0.2)',
        'glow-success': '0 0 16px rgba(16,185,129,0.3)',
        'glow-danger':  '0 0 16px rgba(244,63,94,0.3)',
        glass:  '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        card:   '0 2px 12px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.5)',
        elevated: '0 16px 48px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'brand-gradient':  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        'success-gradient':'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'danger-gradient': 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
        'surface-gradient':'linear-gradient(180deg, #161d2e 0%, #111827 100%)',
        'mesh-bg': `
          radial-gradient(at 20% 20%, rgba(99,102,241,0.07) 0, transparent 50%),
          radial-gradient(at 80% 80%, rgba(139,92,246,0.05) 0, transparent 50%),
          radial-gradient(at 50% 0%,  rgba(56,189,248,0.04) 0, transparent 50%)
        `,
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-4px)' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99,102,241,0.3)' },
          '50%':       { boxShadow: '0 0 20px rgba(99,102,241,0.6)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'status-in': {
          '0%':   { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in':      'fade-in 180ms ease-out both',
        'fade-out':     'fade-out 150ms ease-in both',
        'slide-in-left':'slide-in-left 200ms ease-out both',
        'slide-up':     'slide-up 220ms cubic-bezier(.16,1,.3,1) both',
        'scale-in':     'scale-in 150ms ease-out both',
        'pulse-glow':   'pulse-glow 2s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'status-in':    'status-in 200ms ease-out both',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
}
