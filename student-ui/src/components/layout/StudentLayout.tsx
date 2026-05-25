import { ReactNode } from 'react';

interface StudentLayoutProps {
  leftPanel: ReactNode;
  centerTop: ReactNode;
  centerMiddle: ReactNode;
  centerBottom: ReactNode;
  rightPanel: ReactNode;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function StudentLayout({
  leftPanel,
  centerTop,
  centerMiddle,
  centerBottom,
  rightPanel,
  isDark,
  onToggleTheme,
}: StudentLayoutProps) {
  return (
    <div className="h-screen w-screen overflow-hidden p-3 flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Top bar with logo and theme toggle */}
      <div className="flex justify-between items-center mb-2 px-2 flex-shrink-0">
        <div className="flex items-center gap-2 select-none">
          <img src="/logo.png" alt="PulmoFlow Logo" className="h-9 object-contain bg-white rounded-lg px-2 py-0.5 border border-clinical-border shadow-sm" />
          <span className="text-sm font-bold tracking-wider uppercase text-clinical-text" style={{ color: 'var(--color-text)' }}>
            Symulator
          </span>
        </div>
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 rounded-full flex items-center justify-center 
                     transition-all duration-300 hover:scale-110 active:scale-95 shadow-md"
          style={{ 
            backgroundColor: 'var(--color-panel)', 
            border: '1px solid var(--color-border)',
          }}
          title={isDark ? 'Tryb jasny' : 'Tryb ciemny'}
        >
          {isDark ? (
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        {/* Left panel — settings */}
        <div 
          className="col-span-2 rounded-xl shadow-sm p-3 overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-panel)', 
            border: '1px solid var(--color-border)' 
          }}
        >
          {leftPanel}
        </div>

        {/* Center — charts */}
        <div className="col-span-7 flex flex-col gap-3">
          <div className="flex-1 min-h-0">
            {centerTop}
          </div>
          <div className="flex-1 min-h-0">
            {centerMiddle}
          </div>
          <div className="flex-1 min-h-0">
            {centerBottom}
          </div>
        </div>

        {/* Right panel — always dark navy */}
        <div 
          className="col-span-3 rounded-xl shadow-lg p-3 overflow-hidden"
          style={{ 
            backgroundColor: 'var(--color-right-panel-bg)', 
            border: '1px solid var(--color-right-panel-border)' 
          }}
        >
          {rightPanel}
        </div>
      </div>
    </div>
  );
}

export default StudentLayout;
