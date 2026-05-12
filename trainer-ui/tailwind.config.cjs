/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          bg:           'var(--admin-bg)',
          sidebar:      'var(--admin-sidebar)',
          sidebarHover: 'var(--admin-sidebar-hover)',
          panel:        'var(--admin-panel)',
          border:       'var(--admin-border)',
          text:         'var(--admin-text)',
          muted:        'var(--admin-muted)',
          accent:       'var(--admin-accent)',
          accentHover:  'var(--admin-accent-hover)',
          success:      'var(--admin-success)',
          warning:      'var(--admin-warning)',
          danger:       'var(--admin-danger)',
          // Surfaces for subtle backgrounds (cards inside cards, table headers, etc.)
          surface:      'var(--admin-surface)',
          surfaceHover: 'var(--admin-surface-hover)',
        },
        // Medical monitor chart colors — always vibrant regardless of theme
        chart: {
          pressure: 'var(--chart-pressure)',
          flow:     'var(--chart-flow)',
          volume:   'var(--chart-volume)',
          danger:   'var(--chart-danger)',
          ref:      'var(--chart-ref)',
          grid:     'var(--chart-grid)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 15px -3px var(--admin-accent)',
        'glow-danger': '0 0 15px -3px var(--admin-danger)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 0 rgba(220, 38, 38, 0.0)' },
          '50%': { boxShadow: '0 0 18px 4px rgba(220, 38, 38, 0.35)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
