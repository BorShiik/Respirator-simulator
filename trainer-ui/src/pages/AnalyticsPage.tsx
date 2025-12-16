import { useState, useEffect, useMemo } from 'react';
import { LearningCurveChart } from '../components/analytics/LearningCurveChart';
import { Session, LearningCurveDataPoint, ASYNCHRONY_LABELS } from '../types/trainer';

export function AnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockSessions: Session[] = [
      {
        id: 'session-1',
        stationId: 'station-01',
        traineeId: 'trainee-1',
        traineeName: 'Jan Kowalski',
        scenarioId: 'scenario-1',
        scenarioName: 'Podstawowy trening',
        startTime: Date.now() - 86400000 * 7,
        endTime: Date.now() - 86400000 * 7 + 420000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 420,
          timeToResolveAsynchrony: 180,
          numberOfSettingChanges: 12,
          chaosIndex: 0.45,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-2',
        stationId: 'station-01',
        traineeId: 'trainee-1',
        traineeName: 'Jan Kowalski',
        scenarioId: 'scenario-1',
        scenarioName: 'Podstawowy trening',
        startTime: Date.now() - 86400000 * 6,
        endTime: Date.now() - 86400000 * 6 + 350000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 350,
          timeToResolveAsynchrony: 145,
          numberOfSettingChanges: 9,
          chaosIndex: 0.35,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-3',
        stationId: 'station-02',
        traineeId: 'trainee-1',
        traineeName: 'Jan Kowalski',
        scenarioId: 'scenario-2',
        scenarioName: 'Nieefektywny wyzwalacz',
        startTime: Date.now() - 86400000 * 5,
        endTime: Date.now() - 86400000 * 5 + 520000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 520,
          timeToResolveAsynchrony: 210,
          numberOfSettingChanges: 15,
          chaosIndex: 0.52,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER', 'DOUBLE_TRIGGER'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-4',
        stationId: 'station-01',
        traineeId: 'trainee-1',
        traineeName: 'Jan Kowalski',
        scenarioId: 'scenario-2',
        scenarioName: 'Nieefektywny wyzwalacz',
        startTime: Date.now() - 86400000 * 4,
        endTime: Date.now() - 86400000 * 4 + 380000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 380,
          timeToResolveAsynchrony: 120,
          numberOfSettingChanges: 7,
          chaosIndex: 0.28,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER', 'DOUBLE_TRIGGER'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-5',
        stationId: 'station-03',
        traineeId: 'trainee-2',
        traineeName: 'Anna Nowak',
        scenarioId: 'scenario-1',
        scenarioName: 'Podstawowy trening',
        startTime: Date.now() - 86400000 * 3,
        endTime: Date.now() - 86400000 * 3 + 480000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 480,
          timeToResolveAsynchrony: 220,
          numberOfSettingChanges: 14,
          chaosIndex: 0.55,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-6',
        stationId: 'station-01',
        traineeId: 'trainee-1',
        traineeName: 'Jan Kowalski',
        scenarioId: 'scenario-3',
        scenarioName: 'Problemy z cyklicznością',
        startTime: Date.now() - 86400000 * 2,
        endTime: Date.now() - 86400000 * 2 + 650000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 650,
          timeToResolveAsynchrony: 280,
          numberOfSettingChanges: 18,
          chaosIndex: 0.62,
          asynchronyDetected: true,
          asynchronyTypes: ['DELAYED_CYCLING', 'PREMATURE_CYCLING'],
          successfulResolution: true,
        },
      },
      {
        id: 'session-7',
        stationId: 'station-02',
        traineeId: 'trainee-2',
        traineeName: 'Anna Nowak',
        scenarioId: 'scenario-1',
        scenarioName: 'Podstawowy trening',
        startTime: Date.now() - 86400000,
        endTime: Date.now() - 86400000 + 320000,
        status: 'COMPLETED',
        metrics: {
          totalDuration: 320,
          timeToResolveAsynchrony: 95,
          numberOfSettingChanges: 6,
          chaosIndex: 0.22,
          asynchronyDetected: true,
          asynchronyTypes: ['INEFFECTIVE_TRIGGER'],
          successfulResolution: true,
        },
      },
    ];

    setSessions(mockSessions);
    setIsLoading(false);
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
        date: new Date(session.startTime).toLocaleDateString('pl-PL'),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Analityka</h1>
          <p className="text-admin-muted mt-1">Analiza postępów i wyników kursantów</p>
        </div>
        <div>
          <select
            value={selectedTrainee}
            onChange={(e) => setSelectedTrainee(e.target.value)}
            className="admin-input"
          >
            <option value="all">Wszyscy kursanci</option>
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
          <div className="text-sm text-admin-muted mb-1">Sesje ogółem</div>
          <div className="text-2xl font-bold text-admin-text">{stats.totalSessions}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Ukończone</div>
          <div className="text-2xl font-bold text-admin-success">{stats.completedSessions}</div>
        </div>
        <div className="admin-card p-4">
          <div className="text-sm text-admin-muted mb-1">Śr. czas rozwiązania</div>
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
              <th>Kursant</th>
              <th>Scenariusz</th>
              <th>Czas trwania</th>
              <th>Czas do rozwiązania</th>
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
                      {new Date(session.startTime).toLocaleDateString('pl-PL')}
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
                            : 'Zakończono'
                          : session.status === 'IN_PROGRESS'
                          ? 'W trakcie'
                          : 'Przerwano'}
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
