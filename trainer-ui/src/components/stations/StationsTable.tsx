import { Link } from 'react-router-dom';
import { StationLiveStatus, ASYNCHRONY_LABELS } from '../../types/trainer';
import { trainerApi } from '../../api/trainerApi';
import { useState } from 'react';

interface StationsTableProps {
  stations: StationLiveStatus[];
}

export function StationsTable({ stations }: StationsTableProps) {
  const [loadingCommand, setLoadingCommand] = useState<{ stationId: string; command: string } | null>(null);

  const handleCommand = async (stationId: string, command: 'pause' | 'continue' | 'reset') => {
    setLoadingCommand({ stationId, command });
    try {
      await trainerApi.sendCommand(stationId, command);
    } catch (error) {
      console.error('Command failed:', error);
    } finally {
      setLoadingCommand(null);
    }
  };

  const formatStationName = (stationId: string) => {
    return stationId.replace('station-', 'Station ');
  };

  return (
    <div className="admin-card overflow-hidden">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>Status</th>
            <th>Student</th>
            <th>Scenario</th>
            <th>Asynchrony</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stations.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-8 text-admin-muted">
                No stations available
              </td>
            </tr>
          ) : (
            stations.map((station) => (
              <tr key={station.stationId}>
                <td>
                  <div className="flex items-center gap-2">
                    <span
                      className={`status-dot ${
                        station.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
                      }`}
                    />
                    <span className="font-medium">{formatStationName(station.stationId)}</span>
                  </div>
                </td>
                <td>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      station.status === 'online'
                        ? 'bg-green-100 text-green-800'
                        : station.status === 'error'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {station.status === 'online' ? 'Online' : station.status === 'error' ? 'Error' : 'Offline'}
                  </span>
                </td>
                <td>
                  <span className="text-admin-muted">Not assigned</span>
                </td>
                <td>
                  <span className="text-admin-muted">No scenario</span>
                </td>
                <td>
                  {station.status === 'online' && station.asynchrony ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`status-dot ${
                          station.asynchrony.active ? 'status-dot-async' : 'status-dot-sync'
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          station.asynchrony.active ? 'text-admin-danger font-medium' : 'text-admin-success'
                        }`}
                      >
                        {station.asynchrony.active && station.asynchrony.type
                          ? ASYNCHRONY_LABELS[station.asynchrony.type]
                          : station.asynchrony.active
                          ? 'Detected'
                          : 'Synchrony'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-admin-muted">—</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/stations/${station.stationId}`}
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                    >
                      Details
                    </Link>
                    {station.status === 'online' && (
                      <>
                        <button
                          onClick={() => handleCommand(station.stationId, station.isRunning ? 'pause' : 'continue')}
                          disabled={loadingCommand?.stationId === station.stationId}
                          className={`admin-btn admin-btn-sm ${station.isRunning ? 'admin-btn-warning' : 'admin-btn-success'}`}
                        >
                          {loadingCommand?.stationId === station.stationId &&
                          loadingCommand?.command === (station.isRunning ? 'pause' : 'continue')
                            ? '...'
                            : (station.isRunning ? 'Pause' : 'Continue')}
                        </button>
                        <button
                          onClick={() => handleCommand(station.stationId, 'reset')}
                          disabled={loadingCommand?.stationId === station.stationId}
                          className="admin-btn admin-btn-danger admin-btn-sm"
                        >
                          {loadingCommand?.stationId === station.stationId &&
                          loadingCommand?.command === 'reset'
                            ? '...'
                            : 'Reset'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default StationsTable;
