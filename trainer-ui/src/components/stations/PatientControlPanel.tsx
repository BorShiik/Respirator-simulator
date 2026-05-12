import { useState } from 'react';
import { trainerApi } from '../../api/trainerApi';
import { StationLiveStatus } from '../../types/trainer';

interface PatientControlPanelProps {
  station: StationLiveStatus;
}

export function PatientControlPanel({ station }: PatientControlPanelProps) {
  const [params, setParams] = useState({
    compliance: 50,
    resistance: 10,
    p01: 0,
    rin: 1,
    rout: 20,
    Tcykl: 3.0,
  });

  const [isUpdating, setIsUpdating] = useState(false);

  // You might want to initialize these with actual station data if the station
  // broadcasts its current patient params back to the trainer. Currently, it doesn't
  // do that extensively in the live status object, but if it's there we can sync it.

  const handleChange = (key: string, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const applyParams = async () => {
    setIsUpdating(true);
    try {
      await trainerApi.updatePatientParams(station.stationId, params);
    } catch (error) {
      console.error('Failed to update patient params:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="admin-card p-6">
      <h2 className="text-lg font-semibold text-admin-text mb-4">Live Patient Control</h2>
      
      <div className="space-y-4">
        {/* Compliance */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-admin-text">Compliance (mL/cmH₂O)</label>
            <span className="text-sm font-mono text-admin-accent">{params.compliance}</span>
          </div>
          <input
            type="range"
            min="10"
            max="120"
            step="1"
            value={params.compliance}
            onChange={(e) => handleChange('compliance', Number(e.target.value))}
            className="w-full accent-admin-accent"
            disabled={station.status !== 'online'}
          />
          <div className="flex justify-between text-xs text-admin-muted mt-1">
            <span>Stiff (10)</span>
            <span>Normal (50)</span>
            <span>High (120)</span>
          </div>
        </div>

        {/* Resistance */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-admin-text">Resistance (cmH₂O/L/s)</label>
            <span className="text-sm font-mono text-admin-accent">{params.resistance}</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={params.resistance}
            onChange={(e) => handleChange('resistance', Number(e.target.value))}
            className="w-full accent-admin-accent"
            disabled={station.status !== 'online'}
          />
          <div className="flex justify-between text-xs text-admin-muted mt-1">
            <span>Normal (5)</span>
            <span>High (50)</span>
          </div>
        </div>

        {/* P0.1 / Respiratory Drive */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-admin-text">Respiratory Drive (P0.1)</label>
            <span className="text-sm font-mono text-admin-accent">{params.p01}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={params.p01}
            onChange={(e) => handleChange('p01', Number(e.target.value))}
            className="w-full accent-admin-accent"
            disabled={station.status !== 'online'}
          />
          <div className="flex justify-between text-xs text-admin-muted mt-1">
            <span>None (0)</span>
            <span>Normal (2-4)</span>
            <span>High (&gt;6)</span>
          </div>
        </div>

        <button
          onClick={applyParams}
          disabled={station.status !== 'online' || isUpdating}
          className="admin-btn admin-btn-primary w-full mt-4"
        >
          {isUpdating ? 'Applying...' : 'Apply Live Changes'}
        </button>
      </div>
    </div>
  );
}

export default PatientControlPanel;
