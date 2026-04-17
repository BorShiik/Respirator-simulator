import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTrainerWebSocket } from '../hooks/useTrainerWebSocket';
import { trainerApi } from '../api/trainerApi';
import { Scenario, MODE_LABELS, ASYNCHRONY_LABELS } from '../types/trainer';

export function StationDetailsPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const { stationsMap } = useTrainerWebSocket();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [loadingCommand, setLoadingCommand] = useState<string | null>(null);

  const station = stationId ? stationsMap.get(stationId) : null;

  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const data = await trainerApi.getScenarios();
        setScenarios(data);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
        setScenarios([
          {
            id: 'scenario-1',
            name: 'Basic Training',
            description: 'Beginner scenario',
            difficulty: 'EASY',
            estimatedDuration: 300,
            initialSettings: {
              ipap: 15, epap: 5, peep: 5, rr: 14, ti: 1.0, trigger: 2, vt: 500, pinsp: 15, mode: 'PC-CMV'
            },
            initialResistance: 10,
            initialCompliance: 50,
            blocks: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'scenario-2',
            name: 'Ineffective Trigger',
            description: 'Detection and elimination of ineffective triggering',
            difficulty: 'MEDIUM',
            estimatedDuration: 600,
            initialSettings: {
              ipap: 18, epap: 6, peep: 6, rr: 16, ti: 1.2, trigger: 4, vt: 550, pinsp: 18, mode: 'PC-CMV'
            },
            initialResistance: 15,
            initialCompliance: 40,
            blocks: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]);
      }
    };

    loadScenarios();
  }, []);

  const chartData = useMemo(() => {
    if (!station?.pressure) return [];
    return station.pressure.map((value, index) => ({
      index,
      value,
    }));
  }, [station?.pressure]);

  const flowData = useMemo(() => {
    if (!station?.flow) return [];
    return station.flow.map((value, index) => ({
      index,
      value: value !== null && value !== undefined ? value : 0,
    }));
  }, [station?.flow]);

  const volumeData = useMemo(() => {
    if (!station?.volume) return [];
    return station.volume.map((value, index) => ({
      index,
      value: value !== null && value !== undefined ? value : 0,
    }));
  }, [station?.volume]);

  const handleAssign = async () => {
    if (!stationId || !selectedScenarioId) return;
    setIsAssigning(true);
    try {
      await trainerApi.assignScenario(stationId, selectedScenarioId);
      alert('Scenario assigned successfully. Parameters updated on simulator.');
    } catch (error) {
      console.error('Failed to assign scenario:', error);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCommand = async (command: 'pause' | 'continue' | 'reset') => {
    if (!stationId) return;
    setLoadingCommand(command);
    try {
      await trainerApi.sendCommand(stationId, command);
    } catch (error) {
      console.error('Command failed:', error);
    } finally {
      setLoadingCommand(null);
    }
  };

  const formatStationName = (id: string) => {
    return id.replace('station-', 'Station ');
  };

  if (!stationId) {
    return (
      <div className="text-center py-12">
        <p className="text-admin-muted">Invalid station identifier</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-admin-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-admin-text">
            {formatStationName(stationId)}
          </h1>
          <p className="text-admin-muted mt-1">Station details and management</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-admin-text mb-4">Station status</h2>

            <div className="flex items-center gap-4 mb-6">
              <span
                className={`w-4 h-4 rounded-full ${
                  station?.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-lg font-medium">
                {station?.status === 'online' ? 'Online' : 'Offline'}
              </span>

              {station?.asynchrony && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    station.asynchrony.active
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {station.asynchrony.active
                    ? station.asynchrony.type
                      ? ASYNCHRONY_LABELS[station.asynchrony.type]
                      : 'Asynchrony'
                    : 'Synchrony'}
                </span>
              )}
            </div>

            {station?.settings && (
              <div className="grid grid-cols-6 gap-3 mb-6">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">Mode</div>
                  <div className="font-semibold text-admin-accent">
                    {MODE_LABELS[station.settings.mode]}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">IPAP</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.ipap}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">PEEP</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.peep}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">RR</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.rr}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">Ti</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.ti}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">Trigger</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.trigger}
                  </div>
                </div>
              </div>
            )}

            {chartData.length > 0 && (
              <div className="space-y-4 border-t border-admin-border pt-4">
                <div className="h-48">
                  <h3 className="text-sm font-medium text-admin-muted mb-2">Real-time Pressure (cmH₂O)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[0, 40]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <ReferenceLine y={station?.settings?.peep || 5} stroke="#059669" strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? '#dc2626' : '#0066cc'}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-48">
                  <h3 className="text-sm font-medium text-admin-muted mb-2">Flow (L/min)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={flowData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[-100, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? '#dc2626' : '#f59e0b'}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-48">
                  <h3 className="text-sm font-medium text-admin-muted mb-2">Volume (mL)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[0, 1000]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <ReferenceLine y={station?.settings?.vt || 500} stroke="#059669" strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? '#dc2626' : '#10b981'}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-admin-text mb-4">Control</h2>

            <div className="space-y-3">
              <button
                onClick={() => handleCommand(station?.isRunning ? 'pause' : 'continue')}
                disabled={station?.status !== 'online' || loadingCommand !== null}
                className={`admin-btn w-full ${station?.isRunning ? 'admin-btn-warning' : 'admin-btn-success'}`}
              >
                {loadingCommand === (station?.isRunning ? 'pause' : 'continue') ? (
                  station?.isRunning ? 'Pausing...' : 'Continuing...'
                ) : (
                  station?.isRunning ? 'Pause' : 'Continue'
                )}
              </button>
              <button
                onClick={() => handleCommand('reset')}
                disabled={station?.status !== 'online' || loadingCommand !== null}
                className="admin-btn admin-btn-danger w-full"
              >
                {loadingCommand === 'reset' ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>

          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-admin-text mb-4">Assign scenario</h2>

            <div className="space-y-3">
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="admin-input"
                disabled={station?.status !== 'online'}
              >
                <option value="">Wybierz scenariusz...</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssign}
                disabled={!selectedScenarioId || station?.status !== 'online' || isAssigning}
                className="admin-btn admin-btn-primary w-full"
              >
                {isAssigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>

          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-admin-text mb-4">Informacje</h2>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-admin-muted">Station ID</dt>
                <dd className="font-mono">{stationId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-admin-muted">Last update</dt>
                <dd>
                  {station?.lastUpdate
                    ? new Date(station.lastUpdate).toLocaleTimeString('en-US')
                    : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StationDetailsPage;
