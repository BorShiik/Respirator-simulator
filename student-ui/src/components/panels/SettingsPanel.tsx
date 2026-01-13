import { VentilatorSettings, MODE_LABELS } from '../../types/student';

// Типы параметров с ограничениями
export type ParameterKey = 'ipap' | 'epap' | 'rr' | 'ti' | 'trigger' | 'vt';

export interface ParameterConfig {
  key: ParameterKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export const PARAMETER_CONFIGS: ParameterConfig[] = [
  { key: 'ipap', label: 'IPAP / Pinsp', unit: 'cmH₂O', min: 5, max: 30, step: 1, decimals: 0 },
  { key: 'epap', label: 'EPAP / PEEP', unit: 'cmH₂O', min: 0, max: 15, step: 1, decimals: 0 },
  { key: 'rr', label: 'Częstość (RR)', unit: '/min', min: 5, max: 40, step: 1, decimals: 0 },
  { key: 'ti', label: 'Czas wdechu (Ti)', unit: 's', min: 0.3, max: 3.0, step: 0.1, decimals: 1 },
  { key: 'trigger', label: 'Wyzwalacz', unit: 'cmH₂O', min: 0.5, max: 10, step: 0.5, decimals: 1 },
  { key: 'vt', label: 'Obj. oddechowa (VT)', unit: 'mL', min: 200, max: 1000, step: 50, decimals: 0 },
];

interface SettingsPanelProps {
  settings: VentilatorSettings;
  selectedParameter: ParameterKey | null;
  onParameterSelect: (key: ParameterKey | null) => void;
}

interface ParameterDisplayProps {
  config: ParameterConfig;
  value: number;
  isSelected: boolean;
  onSelect: () => void;
}

function ParameterDisplay({ config, value, isSelected, onSelect }: ParameterDisplayProps) {
  const displayValue = config.decimals === 0 
    ? Math.round(value) 
    : value.toFixed(config.decimals);

  return (
    <div 
      className={`parameter-card cursor-pointer transition-all duration-200 select-none
        ${isSelected 
          ? 'border-clinical-accent border-2 bg-blue-50 ring-2 ring-clinical-accent ring-opacity-50' 
          : 'hover:border-clinical-accent hover:border-opacity-50 active:scale-95'
        }`}
      onClick={onSelect}
    >
      <div className="parameter-label mb-1">{config.label}</div>
      <div className="flex items-baseline">
        <span className={`parameter-value ${isSelected ? 'text-clinical-accent' : 'text-clinical-text'}`}>
          {displayValue}
        </span>
        <span className="parameter-unit">{config.unit}</span>
      </div>
      {isSelected && (
        <div className="text-xs text-clinical-accent mt-1 font-medium animate-pulse">
          ↑↓ zmień wartość
        </div>
      )}
    </div>
  );
}

export function SettingsPanel({ settings, selectedParameter, onParameterSelect }: SettingsPanelProps) {
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
        {PARAMETER_CONFIGS.map((config) => (
          <ParameterDisplay
            key={config.key}
            config={config}
            value={settings[config.key]}
            isSelected={selectedParameter === config.key}
            onSelect={() => onParameterSelect(
              selectedParameter === config.key ? null : config.key
            )}
          />
        ))}
      </div>
    </div>
  );
}

export default SettingsPanel;

