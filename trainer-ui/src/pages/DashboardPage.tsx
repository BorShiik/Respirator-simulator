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
          <p className="text-admin-muted mt-1">Overview of all training stations</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-admin-success'
                : connectionStatus === 'connecting'
                ? 'bg-admin-warning animate-pulse'
                : 'bg-admin-danger'
            }`}
            style={connectionStatus === 'connected' ? { boxShadow: '0 0 6px var(--admin-success)' } : {}}
          />
          <span className="text-sm text-admin-muted">
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 stat-icon-blue rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-text font-mono">{stats.total}</p>
              <p className="text-sm text-admin-muted">Total stations</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 stat-icon-green rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-success font-mono">{stats.online}</p>
              <p className="text-sm text-admin-muted">Online</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 stat-icon-gray rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-muted font-mono">{stats.total - stats.online}</p>
              <p className="text-sm text-admin-muted">Offline</p>
            </div>
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 stat-icon-red rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-admin-danger font-mono">{stats.async}</p>
              <p className="text-sm text-admin-muted">With asynchrony</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stations Preview ──────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-admin-text mb-4">Stations preview</h2>
        <div className="grid grid-cols-3 gap-4">
          {stations.slice(0, 6).map((station) => (
            <StationCard key={station.stationId} station={station} />
          ))}
        </div>
      </div>

      {/* ── All Stations Table ────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-admin-text mb-4">All stations</h2>
        <StationsTable stations={stations} />
      </div>
    </div>
  );
}

export default DashboardPage;
