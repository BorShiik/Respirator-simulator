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
  pressureRaiseT: number; // Pressure rise time (seconds) - NEW
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
  data?: { time: number; pressure: number; flow: number; volume: number }[]; // Batched payload
  settings: VentilatorSettings;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
  difficulty?: string;   // Difficulty level (EASY, MEDIUM, HARD)
  totalTime?: number;        // Current simulation time (seconds)
  scenarioDuration?: number; // Scenario total duration (seconds), 0 = unlimited
  scenarioCompleted?: boolean; // Whether the scenario has completed
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
  resistance: number;    // cmH2O/(L/s) (airway resistance R)
  spontaneousRate: number; // Spontaneous breathing rate
  effort: number;        // Patient effort (0-100%)
  rin: number;           // Inspiratory resistance (cmH2O/(L/s))
  rout: number;          // Expiratory resistance (cmH2O/(L/s))
  p01: number;           // Occlusion pressure (cmH2O)
  Tcykl: number;         // Patient respiratory cycle period (seconds)
  PTi: number;           // Patient inspiratory time (seconds)
  PriorityPR: number;    // Override respirator frequency for auto-triggering (breaths/min, 0=off)
  PressureRaiseT: number; // Pressure rise time (seconds, 0=instant)
  DoubleTriggeringTime: number; // Time in cycle when Pin drops to EPAP for double trigger (seconds, 0=off)
  knobDisable: boolean;  // Lock student knob (cannot change parameters)
}

// Default values
export const DEFAULT_SETTINGS: VentilatorSettings = {
  ipap: 20,
  epap: 5,
  peep: 5,
  rr: 15,
  ti: 1.0,
  trigger: 2,
  vt: 500,
  pinsp: 20,
  mode: 'PC-CMV',
  pressureRaiseT: 0,
};

export const DEFAULT_PATIENT: PatientModel = {
  compliance: 40,      // Idealized: makes curves look clear by default
  resistance: 12,      // Idealized: makes curves look clear by default
  spontaneousRate: 0,  // No spontaneous breathing by default
  effort: 0,
  rin: 1,              // Low inspiratory circuit resistance
  rout: 8,             // Idealized: proper passive expiration
  p01: 2,              // Idealized: mild spontaneous drive
  Tcykl: 3.0,          // Idealized: 3s patient cycle (20 bpm)
  PTi: 1.0,            // Patient inspiratory time
  PriorityPR: 0,       // No auto-triggering override
  PressureRaiseT: 0,   // Instant pressure rise
  DoubleTriggeringTime: 0, // No double triggering
  knobDisable: false,   // Student can adjust parameters
};
