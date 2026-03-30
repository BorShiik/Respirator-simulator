import { useState, useEffect, useMemo } from 'react';
import { LearningCurveChart } from '../components/analytics/LearningCurveChart';
import { Session, LearningCurveDataPoint, ASYNCHRONY_LABELS } from '../types/trainer';
import { trainerApi } from '../api/trainerApi';

export function AnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await trainerApi.getAllSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to fetch session data from server. Ensure the backend is running.');
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const trainees = useMemo(() => {
    const traineeMap = new Map<string, string>();
    sessions.forEach(s => {
      if (!traineeMap.has(s.traineeId)) {
        traineeMap.set(s.traineeId, s.traineeName);
      }
    });
    return Array.from(traineeMap.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (selectedTrainee === 'all') return sessions;
    return sessions.filter(s => s.traineeId === selectedTrainee);
  }, [sessions, selectedTrainee]);

  const learningCurveData: LearningCurveDataPoint[] = useMemo(() => {
    return filteredSessions
      .filter(s => s.status === 'COMPLETED' && s.metrics)
      .sort((a, b) => a.startTime - b.startTime)
      .map((session, index) => ({
        sessionIndex: index + 1,
        scenarioName: session.scenarioName,
        date: new Date(session.startTime).toLocaleDateString('en-US'),
        timeToResolve: session.metrics?.timeToResolveAsynchrony || null,
        settingChanges: session.metrics?.numberOfSettingChanges || 0,
        successful: session.metrics?.successfulResolution || false,
      }));
  }, [filteredSessions]);

  const stats = useMemo(() => {
    const completed = filteredSessions.filter(s => s.status === 'COMPLETED');
    const avgTime = completed.length > 0
      ? completed.reduce((sum, s) => sum + (s.metrics?.timeToResolveAsynchrony || 0), 0) / completed.length
      : 0;
    const avgChanges = completed.length > 0
      ? completed.reduce((sum, s) => sum + (s.metrics?.numberOfSettingChanges || 0), 0) / completed.length
      : 0;
    const successRate = completed.length > 0
      ? (completed.filter(s => s.metrics?.successfulResolution).length / completed.length) * 100
      : 0;

    return {
      totalSessions: filteredSessions.length,
      completedSessions: completed.length,
      avgTimeToResolve: Math.round(avgTime),
      avgSettingChanges: Math.round(avgChanges * 10) / 10,
      successRate: Math.round(successRate),
    };
  }, [filteredSessions]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-admin-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-admin-muted text-center max-w-md">{error}</p>
        <button onClick={loadSessions} className="admin-btn admin-btn-primary">
          Try again
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Analityka</h1>
          <p className="text-admin-muted mt-1">Analiza postępów i wyników studentów</p>
        </div>
        <div className="admin-card flex flex-col items-center justify-center py-16 gap-4">
          <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-lg font-medium text-admin-text">Brak danych analitycznych</p>
          <p className="text-admin-muted text-center max-w-md">
            Nie przeprowadzono jeszcze żadnych sesji treningowych. Przypisz scenariusz do stanowiska i rozpocznij symulację, aby zobaczyć wyniki.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Analytics</h1>
          <p className="text-admin-muted mt-1">Analysis of trainee progress and results</p>
        </div>
        <div>
          <select
            value={selectedTrainee}
            onChange={(e) => setSelectedTrainee(e.target.value)}
            className="admin-input"
          >
            <option value="all">Wszyscy studenci</option>
            {trainees.map((trainee) => (
              <option key={trainee.id} value={trainee.id}>
                {trainee.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Wszystkie sesje</div>
          <div className="text-2xl font-bold text-admin-text">{stats.totalSessions}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Zakończone</div>
          <div className="text-2xl font-bold text-admin-success">{stats.completedSessions}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Śr. czas reakcji</div>
          <div className="text-2xl font-bold text-admin-accent">{formatDuration(stats.avgTimeToResolve)}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Śr. liczba zmian</div>
          <div className="text-2xl font-bold text-admin-text">{stats.avgSettingChanges}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Skuteczność</div>
          <div className="text-2xl font-bold text-admin-success">{stats.successRate}%</div>
        </div>
      </div>

      <div className="admin-card p-6">
        <h2 className="text-lg font-semibold text-admin-text mb-4">Krzywa uczenia się</h2>
        <div className="h-80">
          <LearningCurveChart data={learningCurveData} />
        </div>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="p-4 border-b border-admin-border">
          <h2 className="text-lg font-semibold text-admin-text">Historia sesji</h2>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Student</th>
              <th>Scenariusz</th>
              <th>Czas trwania</th>
              <th>Czas reakcji</th>
              <th>Liczba zmian</th>
              <th>Typy asynchronii</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-admin-muted">
                  Brak sesji do wyświetlenia
                </td>
              </tr>
            ) : (
              filteredSessions
                .sort((a, b) => b.startTime - a.startTime)
                .map((session) => (
                  <tr key={session.id}>
                    <td className="font-mono text-sm">
                      {new Date(session.startTime).toLocaleDateString('en-US')}
                    </td>
                    <td>{session.traineeName}</td>
                    <td>{session.scenarioName}</td>
                    <td className="font-mono">
                      {session.metrics ? formatDuration(session.metrics.totalDuration) : '—'}
                    </td>
                    <td className="font-mono">
                      {session.metrics?.timeToResolveAsynchrony
                        ? formatDuration(session.metrics.timeToResolveAsynchrony)
                        : '—'}
                    </td>
                    <td className="font-mono">
                      {session.metrics?.numberOfSettingChanges ?? '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {session.metrics?.asynchronyTypes.map((type) => (
                          <span
                            key={type}
                            className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs"
                          >
                            {ASYNCHRONY_LABELS[type]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          session.status === 'COMPLETED'
                            ? session.metrics?.successfulResolution
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                            : session.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {session.status === 'COMPLETED'
                          ? session.metrics?.successfulResolution
                            ? 'Sukces'
                            : 'Zakończona'
                          : session.status === 'IN_PROGRESS'
                          ? 'W toku'
                          : 'Przerwana'}
                      </span>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AnalyticsPage;
