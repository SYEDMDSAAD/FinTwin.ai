/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      borderRadius: { card: 'var(--radius-card)', control: 'var(--radius-control)' },
      boxShadow: { card: 'var(--shadow-card)', raised: 'var(--shadow-raised)' },
      fontSize: {
        // One type scale: [size, line-height]
        // the one big number on a screen
        'hero': ['44px', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '650' }],
        'display': ['32px', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '650' }],
        'title': ['22px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '650' }],
        'heading': ['16px', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body': ['15px', { lineHeight: '1.5', letterSpacing: '-0.005em' }],
        'small': ['13px', { lineHeight: '1.45' }],
        'caption': ['12px', { lineHeight: '1.4' }],
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Design-system tokens (index.css); they follow the light/dark theme
      colors: {
        surface: { DEFAULT: 'var(--bg-card)', hover: 'var(--bg-card-hover)', raised: 'var(--bg-floating)', sunken: 'var(--bg-input)' },
        ink: { DEFAULT: 'var(--text-primary)', 2: 'var(--text-secondary)', 3: 'var(--text-dim)' },
        line: { DEFAULT: 'var(--border-card)', strong: 'var(--border-card-hover)' },
        accent: { DEFAULT: 'var(--accent)', strong: 'var(--accent-strong)', soft: 'var(--accent-soft)', on: 'var(--on-accent)' },
        good: { DEFAULT: 'var(--good)', soft: 'var(--good-soft)' },
        bad: { DEFAULT: 'var(--bad)', soft: 'var(--bad-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        brand: {
          violet: '#7c3aed',
          purple: '#a78bfa',
          cyan: '#22d3ee',
        },
      },
    },
  },

  plugins: [
    require("@tailwindcss/typography"),
  ],
}