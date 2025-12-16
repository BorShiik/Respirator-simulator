import { VentilatorSettings, MODE_LABELS } from '../../types/student';

interface SettingsPanelProps {
  settings: VentilatorSettings;
}

interface ParameterDisplayProps {
  label: string;
  value: number | string;
  unit: string;
  highlight?: boolean;
}

function ParameterDisplay({ label, value, unit, highlight = false }: ParameterDisplayProps) {
  return (
    <div className={`parameter-card ${highlight ? 'border-clinical-accent border-2' : ''}`}>
      <div className="parameter-label mb-1">{label}</div>
      <div className="flex items-baseline">
        <span className={`parameter-value ${highlight ? 'text-clinical-accent' : 'text-clinical-text'}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span className="parameter-unit">{unit}</span>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings }: SettingsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-3">
        <span className="text-xs uppercase tracking-wider font-semibold text-clinical-muted">
          Tryb wentylacji
        </span>
        <div className="text-xl font-bold text-clinical-accent mt-1">
          {MODE_LABELS[settings.mode]}
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-2 flex-1">
        <ParameterDisplay
          label="IPAP / Pinsp"
          value={settings.ipap}
          unit="cmH₂O"
          highlight
        />
        
        <ParameterDisplay
          label="EPAP / PEEP"
          value={settings.epap}
          unit="cmH₂O"
        />
        
        <ParameterDisplay
          label="Częstość (RR)"
          value={settings.rr}
          unit="/min"
        />
        
        <ParameterDisplay
          label="Czas wdechu (Ti)"
          value={settings.ti}
          unit="s"
        />
        
        <ParameterDisplay
          label="Wyzwalacz (Trigger)"
          value={settings.trigger}
          unit="cmH₂O"
        />
        
        <ParameterDisplay
          label="Obj. oddechowa (VT)"
          value={settings.vt}
          unit="mL"
        />
      </div>
    </div>
  );
}

export default SettingsPanel;
