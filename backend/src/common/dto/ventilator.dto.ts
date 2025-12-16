// Ventilator modes
export type VentilatorMode = 'PC-CMV' | 'PC-SIMV' | 'PSV' | 'CPAP' | 'VC-CMV' | 'VC-SIMV';

// Asynchrony types
export type AsynchronyType =
  | 'INEFFECTIVE_TRIGGER'
  | 'DOUBLE_TRIGGER'
  | 'AUTO_TRIGGER'
  | 'DELAYED_CYCLING'
  | 'PREMATURE_CYCLING'
  | 'FLOW_MISMATCH'
  | 'REVERSE_TRIGGER';

// Ventilator settings DTO
export interface VentilatorSettings {
  ipap: number;      // Inspiratory Positive Airway Pressure
  epap: number;      // Expiratory Positive Airway Pressure
  peep: number;      // Positive End-Expiratory Pressure
  rr: number;        // Respiratory Rate (breaths/min)
  ti: number;        // Inspiratory Time (seconds)
  trigger: number;   // Trigger sensitivity
  vt: number;        // Tidal Volume (mL)
  pinsp: number;     // Inspiratory Pressure
  mode: VentilatorMode;
}

// Asynchrony status
export interface AsynchronyStatus {
  active: boolean;
  type: AsynchronyType | null;
}

// Telemetry data sent via WebSocket
export interface TelemetryData {
  timestamp: number;
  pressure: number[];    // Array of pressure samples
  flow: number[];        // Array of flow samples
  volume: number[];      // Array of volume samples
  settings: VentilatorSettings;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
}

// WebSocket message types
export interface TelemetryMessage {
  type: 'telemetry';
  data: TelemetryData;
}

export interface SettingsUpdateMessage {
  type: 'settingsUpdate';
  settings: VentilatorSettings;
}

export interface CommandMessage {
  type: 'command';
  command: 'start' | 'stop' | 'reset';
  scenarioId?: string;
}

export interface StatusMessage {
  type: 'status';
  stationId: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  scenarioName?: string;
}

export type WebSocketMessage = 
  | TelemetryMessage 
  | SettingsUpdateMessage 
  | CommandMessage 
  | StatusMessage;

// Patient model parameters
export interface PatientModel {
  compliance: number;    // mL/cmH2O (lung compliance)
  resistance: number;    // cmH2O/(L/s) (airway resistance)
  spontaneousRate: number; // Spontaneous breathing rate
  effort: number;        // Patient effort (0-100%)
}

// Default values
export const DEFAULT_SETTINGS: VentilatorSettings = {
  ipap: 15,
  epap: 5,
  peep: 5,
  rr: 14,
  ti: 1.0,
  trigger: 2,
  vt: 500,
  pinsp: 15,
  mode: 'PC-CMV',
};

export const DEFAULT_PATIENT: PatientModel = {
  compliance: 50,      // Normal: 50-100 mL/cmH2O
  resistance: 5,       // Normal: 2-5 cmH2O/(L/s)
  spontaneousRate: 0,  // No spontaneous breathing by default
  effort: 0,
};
