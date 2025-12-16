import { useState } from 'react';
import { AsynchronyStatus, ASYNCHRONY_LABELS, CommandType } from '../../types/student';
import { studentApi } from '../../api/studentApi';

interface StatusPanelProps {
  scenarioName: string;
  asynchrony: AsynchronyStatus;
  studentName: string;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isRegistered?: boolean;
  onLogout?: () => void;
}

export function StatusPanel({ 
  scenarioName, 
  asynchrony, 
  studentName, 
  connectionStatus,
  isRegistered = true,
  onLogout 
}: StatusPanelProps) {
  const [isLoading, setIsLoading] = useState<CommandType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleCommand = async (command: CommandType) => {
    setIsLoading(command);
    setMessage(null);
    
    try {
      const response = await studentApi.sendCommand(studentName, command);
      if (!response.success) {
        setMessage(response.message);
      }
    } catch (error) {
      setMessage('Błąd komunikacji z serwerem');
    } finally {
      setIsLoading(null);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return isRegistered ? 'bg-green-500' : 'bg-yellow-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'disconnected': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
    }
  };

  const getConnectionStatusText = () => {
    if (connectionStatus === 'connected' && !isRegistered) {
      return 'Rejestracja...';
    }
    switch (connectionStatus) {
      case 'connected': return 'Połączono';
      case 'connecting': return 'Łączenie...';
      case 'disconnected': return 'Rozłączono';
      case 'error': return 'Błąd';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with student name and logout */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-clinical-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getConnectionStatusColor()}`} />
          <span className="text-xs text-clinical-muted truncate">{getConnectionStatusText()}</span>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-xs text-clinical-muted hover:text-red-500 transition-colors flex-shrink-0"
            title="Wyloguj się"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </div>

      {/* Student name */}
      <div className="parameter-card mb-3">
        <div className="parameter-label mb-1">Student</div>
        <div className="text-sm font-semibold text-clinical-text truncate">
          {studentName}
        </div>
      </div>

      <div className="parameter-card mb-3">
        <div className="parameter-label mb-1">Scenariusz</div>
        <div className="text-sm font-semibold text-clinical-text truncate">
          {scenarioName || 'Brak scenariusza'}
        </div>
      </div>

      <div className={`flex-1 rounded-xl flex flex-col items-center justify-center p-4 mb-4 transition-colors duration-300 ${
        asynchrony.active 
          ? 'bg-red-100 border-4 border-red-500' 
          : 'bg-green-100 border-4 border-green-500'
      }`}>
        <div className={`text-lg font-bold uppercase tracking-wide mb-2 ${
          asynchrony.active ? 'text-red-700' : 'text-green-700'
        }`}>
          {asynchrony.active ? 'ASYNCHRONIA' : 'SYNCHRONIA'}
        </div>
        
        {asynchrony.active && asynchrony.type && (
          <div className="text-sm font-medium text-red-600 text-center">
            {ASYNCHRONY_LABELS[asynchrony.type]}
          </div>
        )}
        
        {!asynchrony.active && (
          <div className="text-sm font-medium text-green-600">
            Prawidłowa interakcja
          </div>
        )}

        <div className="mt-3">
          {asynchrony.active ? (
            <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => handleCommand('start')}
          disabled={isLoading !== null || connectionStatus !== 'connected' || !isRegistered}
          className="control-button control-button-primary w-full"
        >
          {isLoading === 'start' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Start...
            </span>
          ) : (
            <>
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start
            </>
          )}
        </button>
        
        <button
          onClick={() => handleCommand('stop')}
          disabled={isLoading !== null || connectionStatus !== 'connected' || !isRegistered}
          className="control-button control-button-danger w-full"
        >
          {isLoading === 'stop' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Stop...
            </span>
          ) : (
            <>
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Stop
            </>
          )}
        </button>
        
        <button
          onClick={() => handleCommand('reset')}
          disabled={isLoading !== null || connectionStatus !== 'connected' || !isRegistered}
          className="control-button control-button-warning w-full"
        >
          {isLoading === 'reset' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Reset...
            </span>
          ) : (
            <>
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </>
          )}
        </button>
      </div>

      {message && (
        <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
          {message}
        </div>
      )}
    </div>
  );
}

export default StatusPanel;
