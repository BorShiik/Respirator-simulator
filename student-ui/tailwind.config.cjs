/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        clinical: {
          bg: '#f0f4f8',
          panel: '#ffffff',
          border: '#d1dce8',
          text: '#1a365d',
          muted: '#64748b',
          accent: '#0066cc',
          success: '#059669',
          warning: '#d97706',
          danger: '#dc2626',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'value-lg': ['2.5rem', { lineHeight: '1', fontWeight: '700' }],
        'value-xl': ['3.5rem', { lineHeight: '1', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
