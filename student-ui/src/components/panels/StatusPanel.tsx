import { useState } from 'react';
import { AsynchronyStatus, ASYNCHRONY_LABELS, CommandType, DifficultyLevel, PatientParams } from '../../types/student';
import { studentApi } from '../../api/studentApi';

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  EASY: 'Łatwy',
  MEDIUM: 'Średni',
  HARD: 'Trudny',
};

const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  EASY: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  HARD: 'bg-red-500',
};

const PATIENT_PARAM_LABELS: { key: keyof PatientParams; label: string; unit: string }[] = [
  { key: 'resistance', label: 'R (opór)', unit: 'cmH₂O/(L/s)' },
  { key: 'compliance', label: 'C (podatność)', unit: 'mL/cmH₂O' },
  { key: 'rin', label: 'Rin', unit: 'cmH₂O/(L/s)' },
  { key: 'rout', label: 'Rout', unit: 'cmH₂O/(L/s)' },
  { key: 'p01', label: 'P0.1', unit: 'cmH₂O' },
  { key: 'Tcykl', label: 'Tcykl', unit: 's' },
  { key: 'PTi', label: 'PTi', unit: 's' },
  { key: 'PriorityPR', label: 'PriorityPR', unit: '/min' },
  { key: 'PressureRaiseT', label: 'PressureRaiseT', unit: 's' },
  { key: 'DoubleTriggeringTime', label: 'DoubleTrigger', unit: 's' },
];

interface StatusPanelProps {
  scenarioName: string;
  asynchrony: AsynchronyStatus;
  studentName: string;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isRegistered?: boolean;
  onLogout?: () => void;
  simulationStatus?: string | null;
  difficulty?: DifficultyLevel;
  patientParams?: PatientParams | null;
}

/* ────────────────────────────────────────────────────────────────
   CSS-variable shortcuts for right panel theming.
   In dark mode these resolve to white-on-dark,
   in light mode to dark-on-white (set in index.css).
   ──────────────────────────────────────────────────────────────── */
const V = {
  text:  'var(--color-right-panel-text)',
  muted: 'var(--color-right-panel-muted)',
  bg:    'var(--color-right-panel-bg)',
  border:'var(--color-right-panel-border)',
  // glass card: slightly transparent overlay that works on any bg
  glass: 'color-mix(in srgb, var(--color-right-panel-text) 6%, transparent)',
  glassBorder: 'color-mix(in srgb, var(--color-right-panel-text) 10%, transparent)',
  glassHover: 'color-mix(in srgb, var(--color-right-panel-text) 12%, transparent)',
  subtle: 'color-mix(in srgb, var(--color-right-panel-text) 4%, transparent)',
};

export function StatusPanel({ 
  scenarioName, 
  asynchrony, 
  studentName, 
  connectionStatus,
  isRegistered = true,
  onLogout,
  simulationStatus,
  difficulty = 'EASY',
  patientParams = null,
}: StatusPanelProps) {
  const [isLoading, setIsLoading] = useState<CommandType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPatientParams, setShowPatientParams] = useState(false);
  const isRunning = simulationStatus === 'running';

  const handleCommand = async (command: CommandType) => {
    setIsLoading(command);
    setMessage(null);
    try {
      const response = await studentApi.sendCommand(studentName, command);
      if (!response.success) setMessage(response.message);
    } catch {
      setMessage('Błąd komunikacji z serwerem');
    } finally {
      setIsLoading(null);
    }
  };

  const getConnectionDot = () => {
    switch (connectionStatus) {
      case 'connected': return isRegistered 
        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' 
        : 'bg-amber-400 animate-pulse';
      case 'connecting': return 'bg-amber-400 animate-pulse';
      case 'disconnected': return 'bg-gray-500';
      case 'error': return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
    }
  };

  const getConnectionText = () => {
    if (connectionStatus === 'connected' && !isRegistered) return 'Rejestracja...';
    switch (connectionStatus) {
      case 'connected': return 'Połączono';
      case 'connecting': return 'Łączenie...';
      case 'disconnected': return 'Rozłączono';
      case 'error': return 'Błąd';
    }
  };

  const isAsync = asynchrony.active;
  const ringColor = isAsync ? '#ef4444' : '#22c55e';
  const ringGlow = isAsync 
    ? '0 0 20px rgba(239,68,68,0.4), 0 0 40px rgba(239,68,68,0.15)' 
    : '0 0 20px rgba(34,197,94,0.4), 0 0 40px rgba(34,197,94,0.15)';

  return (
    <div className="flex flex-col h-full relative" style={{ color: V.text }}>

      {/* ══════ Header: Connection + Name + Logout ══════ */}
      <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: `1px solid ${V.glassBorder}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getConnectionDot()}`} />
          <span className="text-[11px] truncate" style={{ color: V.muted }}>{getConnectionText()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] truncate max-w-[100px]" style={{ color: V.muted }}>{studentName}</span>
          {onLogout && (
            <button onClick={onLogout} className="hover:text-red-400 transition-colors" style={{ color: V.muted }} title="Wyloguj">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ══════ Scenario Card ══════ */}
      {difficulty !== 'HARD' && (
        <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: V.glass, border: `1px solid ${V.glassBorder}` }}>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: V.muted }}>Scenariusz</div>
          <div className="text-sm font-semibold truncate" style={{ color: V.text }}>
            {scenarioName || 'Brak scenariusza'}
          </div>
        </div>
      )}

      {/* ══════ Difficulty dots ══════ */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: V.subtle, border: `1px solid ${V.glassBorder}` }}>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: V.muted }}>Poziom</span>
        <div className="flex items-center gap-1.5">
          {(['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[]).map((level) => (
            <div key={level} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              (['EASY', 'MEDIUM', 'HARD'].indexOf(level) <= ['EASY', 'MEDIUM', 'HARD'].indexOf(difficulty))
                ? DIFFICULTY_COLORS[difficulty]
                : 'bg-gray-400/30'
            }`} />
          ))}
          <span className={`text-xs font-medium ml-1.5 ${
            difficulty === 'EASY' ? 'text-emerald-500' :
            difficulty === 'MEDIUM' ? 'text-amber-500' :
            'text-red-500'
          }`}>
            {DIFFICULTY_LABELS[difficulty]}
          </span>
        </div>
      </div>

      {/* ══════ Circular Status Indicator ══════ */}
      <div className="flex-1 flex items-center justify-center">
        {difficulty === 'HARD' ? (
          <div className="flex flex-col items-center">
            <div className="w-32 h-32 rounded-full border-[5px] border-gray-400/40 flex items-center justify-center"
              style={{ boxShadow: '0 0 15px rgba(107,114,128,0.15)' }}>
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="mt-3 text-sm font-bold uppercase tracking-wider text-gray-400">
              Obserwuj wykresy
            </div>
            <div className="text-[11px] text-gray-400/60 mt-1">Tryb zaawansowany</div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div 
              className="w-32 h-32 rounded-full border-[5px] flex items-center justify-center transition-all duration-500"
              style={{ borderColor: ringColor, boxShadow: ringGlow }}
            >
              {isAsync ? (
                <svg className="w-12 h-12" fill="none" stroke={ringColor} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-12 h-12" fill="none" stroke={ringColor} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className={`mt-3 text-sm font-bold uppercase tracking-wider transition-colors duration-500 ${
              isAsync ? 'text-red-500' : 'text-emerald-500'
            }`}>
              {isAsync ? 'ASYNCHRONIA' : 'SYNCHRONIA'}
            </div>
            {difficulty === 'EASY' && isAsync && asynchrony.type && (
              <div className="mt-1 text-xs text-red-400 text-center">
                {ASYNCHRONY_LABELS[asynchrony.type]}
              </div>
            )}
            {difficulty === 'MEDIUM' && isAsync && (
              <div className="mt-1 text-xs text-red-400/70 text-center">
                Wykryj typ asynchronii
              </div>
            )}
            {!isAsync && (
              <div className="mt-1 text-xs text-emerald-500/70">
                Poprawna interakcja
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════ Patient Parameters Button ══════ */}
      <button
        onClick={() => setShowPatientParams(!showPatientParams)}
        className="w-full mb-2 px-3 py-2.5 rounded-lg transition-all duration-200
                   flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wider"
        style={{ 
          backgroundColor: V.glass, 
          border: `1px solid ${V.glassBorder}`,
          color: V.muted,
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Parametry pacjenta
        <svg className={`w-3 h-3 transition-transform duration-200 ${showPatientParams ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ══════ Patient Parameters Dropdown ══════ */}
      {showPatientParams && (
        <div className="mb-2 rounded-lg p-2 max-h-[200px] overflow-y-auto scrollbar-hide animate-fadeIn"
          style={{ backgroundColor: V.glass, border: `1px solid ${V.glassBorder}` }}>
          {patientParams ? (
            <div className="grid grid-cols-2 gap-1.5">
              {PATIENT_PARAM_LABELS.map(({ key, label, unit }) => (
                <div key={key} className="px-2 py-1.5 rounded" style={{ backgroundColor: V.subtle }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: V.muted }}>{label}</div>
                  <div className="text-xs font-mono" style={{ color: V.text }}>
                    {typeof patientParams[key] === 'boolean' 
                      ? (patientParams[key] ? 'Tak' : 'Nie')
                      : (patientParams[key] as number).toFixed(1)}
                    <span className="text-[9px] ml-0.5" style={{ color: V.muted }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-xs py-3" style={{ color: V.muted }}>
              Brak danych pacjenta
            </div>
          )}
        </div>
      )}

      {/* ══════ Control Buttons ══════ */}
      <div className="flex gap-2">
        <button
          onClick={() => handleCommand(isRunning ? 'pause' : 'continue')}
          disabled={isLoading !== null || connectionStatus !== 'connected' || !isRegistered}
          className={`flex-1 px-3 py-2.5 rounded-lg font-medium text-xs uppercase tracking-wider
                     transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed
                     flex items-center justify-center gap-1.5 ${
            isRunning 
              ? 'bg-amber-500/20 text-amber-600 border border-amber-500/30 hover:bg-amber-500/30' 
              : 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/30'
          }`}
        >
          {isLoading === (isRunning ? 'pause' : 'continue') ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : isRunning ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {isRunning ? 'Pauza' : 'Start'}
        </button>

        <button
          onClick={() => handleCommand('reset')}
          disabled={isLoading !== null || connectionStatus !== 'connected' || !isRegistered}
          className="px-3 py-2.5 rounded-lg font-medium text-xs uppercase tracking-wider
                     bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500/25
                     transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed
                     flex items-center justify-center gap-1.5"
        >
          {isLoading === 'reset' ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Reset
        </button>
      </div>

      {message && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">
          {message}
        </div>
      )}
    </div>
  );
}

export default StatusPanel;
