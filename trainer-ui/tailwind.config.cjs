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
          bg: '#f1f5f9',
          sidebar: '#1e293b',
          sidebarHover: '#334155',
          panel: '#ffffff',
          border: '#e2e8f0',
          text: '#1e293b',
          muted: '#64748b',
          accent: '#0066cc',
          success: '#059669',
          warning: '#d97706',
          danger: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
