import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { StationLiveStatus, MODE_LABELS } from '../../types/trainer';

interface StationCardProps {
  station: StationLiveStatus;
}

export function StationCard({ station }: StationCardProps) {
  const navigate = useNavigate();

  const chartData = useMemo(() => {
    return station.pressure.map((value, index) => ({
      index,
      value,
    }));
  }, [station.pressure]);

  const formatStationName = (stationId: string) => {
    return stationId.replace('station-', 'Stanowisko ');
  };

  const hasAsync = station.status === 'online' && station.asynchrony?.active;

  return (
    <div
      className={`admin-card p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:ring-2 hover:ring-admin-accent/30 ${
        hasAsync ? 'async-glow' : ''
      }`}
      onClick={() => navigate(`/stations/${station.stationId}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/stations/${station.stationId}`);
        }
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-admin-text">
            {formatStationName(station.stationId)}
            {station.studentName && (
              <span className="ml-2 text-admin-muted font-normal">
                - {station.studentName}
              </span>
            )}
          </h3>
          <div className="text-xs text-admin-muted mt-1">
             {station.scenarioName ? station.scenarioName : 'Free Practice'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`status-dot ${
                station.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
              }`}
            />
            <span className="text-sm text-admin-muted">
              {station.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {station.status === 'online' && station.asynchrony && (
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              station.asynchrony.active
                ? 'badge-red'
                : 'badge-green'
            }`}
          >
            {station.asynchrony.active ? 'Asynchronia' : 'Synchronia'}
          </div>
        )}
      </div>

      {station.status === 'online' && station.settings && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="bg-admin-surface rounded-lg p-2">
              <div className="text-xs text-admin-muted">IPAP</div>
              <div className="font-mono font-semibold text-admin-accent">
                {station.settings.ipap}
              </div>
            </div>
            <div className="bg-admin-surface rounded-lg p-2">
              <div className="text-xs text-admin-muted">PEEP</div>
              <div className="font-mono font-semibold text-admin-accent">
                {station.settings.peep}
              </div>
            </div>
            <div className="bg-admin-surface rounded-lg p-2">
              <div className="text-xs text-admin-muted">RR</div>
              <div className="font-mono font-semibold text-admin-accent">
                {station.settings.rr}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <div className="text-xs text-admin-muted mb-1">Tryb</div>
              <div className="text-sm font-medium text-admin-text">
                {MODE_LABELS[station.settings.mode]}
              </div>
            </div>
            <div>
              <div className="text-xs text-admin-muted mb-1">Scenariusz</div>
              <div className="text-sm font-medium text-admin-text">
                {station.scenarioName || 'Brak'}
              </div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="h-16 mt-3 border-t border-admin-border pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={station.asynchrony?.active ? 'var(--chart-danger)' : 'var(--chart-pressure)'}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {station.status !== 'online' && (
        <div className="py-8 text-center text-admin-muted text-sm">
          Stanowisko niedostępne
        </div>
      )}
    </div>
  );
}

export default StationCard;
