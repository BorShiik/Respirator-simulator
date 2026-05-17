import { EventLogEntry, ASYNCHRONY_LABELS } from '../../types/trainer';

interface EventLogFeedProps {
  logs: EventLogEntry[];
  stationId: string;
}

export function EventLogFeed({ logs, stationId }: EventLogFeedProps) {
  // Filter logs for this specific station
  const stationLogs = logs.filter(log => log.stationId === stationId);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderLogEntry = (log: EventLogEntry) => {
    switch (log.event) {
      case 'setting_change':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-accent" />
            <div>
              <p className="text-sm text-admin-text">
                Zmieniono ustawienie <span className="font-semibold">{log.details.parameter.toUpperCase()}</span> z{' '}
                <span className="font-mono">{log.details.previousValue}</span> na{' '}
                <span className="font-mono">{log.details.newValue}</span>
              </p>
              {log.details.wasAsynchronyActive && (
                <p className="text-xs text-admin-muted mt-0.5">
                  Podczas asynchronii ({ASYNCHRONY_LABELS[log.details.asynchronyType as keyof typeof ASYNCHRONY_LABELS] || log.details.asynchronyType})
                </p>
              )}
            </div>
          </div>
        );
      case 'asynchrony_injected':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-danger" />
            <div>
              <p className="text-sm text-admin-danger font-medium">
                Początek asynchronii
              </p>
              <p className="text-xs text-admin-muted mt-0.5">
                Typ: {ASYNCHRONY_LABELS[log.details.asynchronyType as keyof typeof ASYNCHRONY_LABELS] || log.details.asynchronyType}
              </p>
            </div>
          </div>
        );
      case 'asynchrony_resolved':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-success" />
            <div>
              <p className="text-sm text-admin-success font-medium">
                Asynchronia rozwiązana
              </p>
              <p className="text-xs text-admin-muted mt-0.5">
                Typ: {ASYNCHRONY_LABELS[log.details.asynchronyType as keyof typeof ASYNCHRONY_LABELS] || log.details.asynchronyType}
              </p>
            </div>
          </div>
        );
      case 'TRAINER_PATIENT_OVERRIDE':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-warning" />
            <div>
              <p className="text-sm text-admin-text">
                Live Intervention (Trener)
              </p>
              <p className="text-xs text-admin-muted mt-0.5">
                {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </p>
            </div>
          </div>
        );
      case 'TRAINER_COMMAND':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-warning" />
            <div>
              <p className="text-sm text-admin-text">
                Polecenie trenera: <span className="font-semibold uppercase text-admin-warning">{log.details.command}</span>
              </p>
            </div>
          </div>
        );
      case 'SESSION_START':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-400">
                Rozpoczęcie sesji (Start)
              </p>
              <p className="text-xs text-admin-muted mt-0.5">
                Scenariusz: {log.details.scenarioName || 'Free Practice'}
              </p>
            </div>
          </div>
        );
      case 'SCENARIO_ASSIGNED':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
            <div>
              <p className="text-sm font-medium text-purple-400">
                Przypisano nowy scenariusz
              </p>
              <p className="text-xs text-admin-muted mt-0.5">
                Scenariusz: <span className="font-semibold text-admin-text">{log.details.scenarioName}</span>
              </p>
            </div>
          </div>
        );
      case 'SESSION_STOP':
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-400">
                Zakończenie scenariusza / Stop
              </p>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex items-start gap-3">
            <div className="mt-1 w-2 h-2 rounded-full bg-admin-muted" />
            <div>
              <p className="text-sm text-admin-text">{log.event}</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="admin-card flex flex-col h-full max-h-[500px]">
      <div className="p-4 border-b border-admin-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-admin-text flex items-center gap-2">
          <svg className="w-5 h-5 text-admin-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Dziennik Zdarzeń (Live)
        </h2>
        <span className="text-xs text-admin-muted bg-admin-surface px-2 py-1 rounded">
          {stationLogs.length} events
        </span>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto scrollbar-thin space-y-4">
        {stationLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-admin-muted text-sm italic">
            Brak zdarzeń dla tego stanowiska w bieżącej sesji.
          </div>
        ) : (
          stationLogs.map((log, idx) => (
            <div key={`${log.timestamp}-${idx}`} className="flex gap-4">
              <div className="text-xs font-mono text-admin-muted pt-0.5 w-16 shrink-0">
                {formatTime(log.timestamp)}
              </div>
              <div className="flex-1">
                {renderLogEntry(log)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EventLogFeed;
