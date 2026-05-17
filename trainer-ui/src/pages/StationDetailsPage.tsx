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
import { useTheme } from '../hooks/useTheme';
import { trainerApi } from '../api/trainerApi';
import { Scenario, MODE_LABELS, ASYNCHRONY_LABELS, DEFAULT_PATIENT_PARAMS } from '../types/trainer';
import { PatientControlPanel } from '../components/stations/PatientControlPanel';
import { EventLogFeed } from '../components/stations/EventLogFeed';

export function StationDetailsPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const { stationsMap, eventLog } = useTrainerWebSocket();
  const { theme } = useTheme();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [loadingCommand, setLoadingCommand] = useState<string | null>(null);

  const station = stationId ? stationsMap.get(stationId) : null;

  /* Chart theme-aware colors */
  const chartColors = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      pressure: style.getPropertyValue('--chart-pressure').trim() || '#22d3ee',
      flow: style.getPropertyValue('--chart-flow').trim() || '#fbbf24',
      volume: style.getPropertyValue('--chart-volume').trim() || '#34d399',
      danger: style.getPropertyValue('--chart-danger').trim() || '#f87171',
      grid: style.getPropertyValue('--chart-grid').trim() || '#1e293b',
      ref: style.getPropertyValue('--chart-ref').trim() || '#475569',
      muted: style.getPropertyValue('--admin-muted').trim() || '#94a3b8',
      success: style.getPropertyValue('--admin-success').trim() || '#10b981',
    };
  }, [theme]);

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
            initialPatientParams: { ...DEFAULT_PATIENT_PARAMS },
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
            initialPatientParams: { ...DEFAULT_PATIENT_PARAMS, p01: 2 },
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
    const data = station?.pressure || [];
    const padded = new Array(Math.max(0, 500 - data.length)).fill(null).concat(data);
    return padded.map((value, index) => ({
      index,
      value: value
    }));
  }, [station?.pressure]);

  const flowData = useMemo(() => {
    const data = station?.flow || [];
    const padded = new Array(Math.max(0, 500 - data.length)).fill(null).concat(data);
    return padded.map((value, index) => ({
      index,
      value: value
    }));
  }, [station?.flow]);

  const volumeData = useMemo(() => {
    const data = station?.volume || [];
    const padded = new Array(Math.max(0, 500 - data.length)).fill(null).concat(data);
    return padded.map((value, index) => ({
      index,
      value: value
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
        <Link to="/" className="p-2 hover:bg-admin-surface rounded-lg transition-colors">
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
                  station?.status === 'online' ? 'bg-admin-success' : 'bg-admin-muted'
                }`}
                style={station?.status === 'online' ? { boxShadow: '0 0 8px var(--admin-success)' } : { opacity: 0.5 }}
              />
              <span className="text-lg font-medium text-admin-text">
                {station?.status === 'online' ? 'Online' : 'Offline'}
              </span>

              {station?.asynchrony && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    station.asynchrony.active
                      ? 'badge-red'
                      : 'badge-green'
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
                <div className="bg-admin-surface rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">Mode</div>
                  <div className="font-semibold text-admin-accent">
                    {MODE_LABELS[station.settings.mode]}
                  </div>
                </div>
                <div className="bg-admin-surface rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">IPAP</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.ipap}
                  </div>
                </div>
                <div className="bg-admin-surface rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">PEEP</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.peep}
                  </div>
                </div>
                <div className="bg-admin-surface rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">RR</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.rr}
                  </div>
                </div>
                <div className="bg-admin-surface rounded-lg p-3 text-center">
                  <div className="text-xs text-admin-muted mb-1">Ti</div>
                  <div className="font-mono font-semibold text-admin-accent">
                    {station.settings.ti}
                  </div>
                </div>
                <div className="bg-admin-surface rounded-lg p-3 text-center">
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
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[-5, 40]} allowDataOverflow={true} tick={{ fontSize: 11, fill: chartColors.muted }} />
                      <ReferenceLine y={station?.settings?.peep || 5} stroke={chartColors.success} strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? chartColors.danger : chartColors.pressure}
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
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[-100, 100]} allowDataOverflow={true} tick={{ fontSize: 11, fill: chartColors.muted }} />
                      <ReferenceLine y={0} stroke={chartColors.ref} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? chartColors.danger : chartColors.flow}
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
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="index" tick={false} />
                      <YAxis domain={[0, 800]} allowDataOverflow={true} tick={{ fontSize: 11, fill: chartColors.muted }} />
                      <ReferenceLine y={station?.settings?.vt || 500} stroke={chartColors.success} strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={station?.asynchrony?.active ? chartColors.danger : chartColors.volume}
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

          {/* Event Log */}
          <EventLogFeed logs={eventLog} stationId={stationId || ''} />
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

          {/* Live Patient Control */}
          {station && <PatientControlPanel station={station} />}

          <div className="admin-card p-6">
            <h2 className="text-lg font-semibold text-admin-text mb-4">Informacje</h2>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-admin-muted">Station ID</dt>
                <dd className="font-mono text-admin-text">{stationId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-admin-muted">Last update</dt>
                <dd className="text-admin-text">
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
