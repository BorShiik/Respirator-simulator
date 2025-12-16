import { useMemo } from 'react';
import { StationsTable } from '../components/stations/StationsTable';
import { StationCard } from '../components/stations/StationCard';
import { useTrainerWebSocket } from '../hooks/useTrainerWebSocket';

export function DashboardPage() {
  const { stationsMap, connectionStatus } = useTrainerWebSocket();

  const stations = useMemo(() => {
    return Array.from(stationsMap.values()).sort((a, b) =>
      a.stationId.localeCompare(b.stationId)
    );
  }, [stationsMap]);

  const stats = useMemo(() => {
    const online = stations.filter((s) => s.status === 'online').length;
    const async = stations.filter((s) => s.asynchrony?.active).length;
    const total = stations.length;

    return { online, async, total };
  }, [stations]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Dashboard</h1>
          <p className="text-admin-muted mt-1">Przegląd wszystkich stanowisk treningowych</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-green-500'
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-admin-muted">
            {connectionStatus === 'connected'
              ? 'Połączono'
              : connectionStatus === 'connecting'
              ? 'Łączenie...'
              : 'Rozłączono'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-text">{stats.total}</p>
              <p className="text-sm text-admin-muted">Wszystkie stanowiska</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-text">{stats.online}</p>
              <p className="text-sm text-admin-muted">Online</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-text">{stats.total - stats.online}</p>
              <p className="text-sm text-admin-muted">Offline</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-text">{stats.async}</p>
              <p className="text-sm text-admin-muted">Z asynchronią</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-admin-text mb-4">Podgląd stanowisk</h2>
        <div className="grid grid-cols-3 gap-4">
          {stations.slice(0, 6).map((station) => (
            <StationCard key={station.stationId} station={station} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-admin-text mb-4">Wszystkie stanowiska</h2>
        <StationsTable stations={stations} />
      </div>
    </div>
  );
}

export default DashboardPage;
