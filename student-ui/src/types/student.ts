export interface VentilatorSettings {
  ipap: number;
  epap: number;
  peep: number;
  rr: number;
  ti: number;
  trigger: number;
  vt: number;
  pinsp: number;
  mode: VentilatorMode;
}

export type VentilatorMode = 'PC-CMV' | 'PC-SIMV' | 'PSV' | 'CPAP' | 'VC-CMV' | 'VC-SIMV';

export interface AsynchronyStatus {
  active: boolean;
  type: AsynchronyType | null;
}

export type AsynchronyType = 
  | 'INEFFECTIVE_TRIGGER'
  | 'DOUBLE_TRIGGER'
  | 'AUTO_TRIGGER'
  | 'DELAYED_CYCLING'
  | 'PREMATURE_CYCLING'
  | 'FLOW_MISMATCH'
  | 'REVERSE_TRIGGER';

export interface TelemetryData {
  timestamp: number;
  pressure: number[];
  flow: number[];
  volume: number[];
  settings: VentilatorSettings;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
}

export interface TelemetryMessage {
  type: 'telemetry';
  timestamp: number;
  pressure: number[];
  flow: number[];
  volume: number[];
  settings: VentilatorSettings;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
}

export interface SettingsUpdateMessage {
  type: 'settingsUpdate';
  settings: VentilatorSettings;
}

export interface RegisteredMessage {
  type: 'registered';
  studentName: string;
  status: string;
}

export interface LoggedOutMessage {
  type: 'loggedOut';
  status: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface StatusMessage {
  type: 'status';
  status: string;
  scenarioName?: string;
  studentName?: string;
}

export interface ConnectedMessage {
  type: 'connected';
  status: string;
}

export interface ParameterSelectedMessage {
  type: 'parameterSelected';
  parameter: string;
}

export type WebSocketMessage = 
  | TelemetryMessage 
  | SettingsUpdateMessage 
  | ParameterSelectedMessage
  | RegisteredMessage 
  | LoggedOutMessage 
  | ErrorMessage 
  | StatusMessage
  | ConnectedMessage;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type CommandType = 'start' | 'stop' | 'reset';

export interface CommandRequest {
  command: CommandType;
}

export interface CommandResponse {
  success: boolean;
  message: string;
}

export interface ChartDataPoint {
  time: number;
  value: number;
}

export const ASYNCHRONY_LABELS: Record<AsynchronyType, string> = {
  INEFFECTIVE_TRIGGER: 'Nieefektywny wyzwalacz',
  DOUBLE_TRIGGER: 'Podwójne wyzwalanie',
  AUTO_TRIGGER: 'Automatyczne wyzwalanie',
  DELAYED_CYCLING: 'Opóźniona cykliczność',
  PREMATURE_CYCLING: 'Przedwczesna cykliczność',
  FLOW_MISMATCH: 'Niedopasowanie przepływu',
  REVERSE_TRIGGER: 'Odwrócone wyzwalanie',
};

export const MODE_LABELS: Record<VentilatorMode, string> = {
  'PC-CMV': 'PC-CMV',
  'PC-SIMV': 'PC-SIMV',
  'PSV': 'PSV',
  'CPAP': 'CPAP',
  'VC-CMV': 'VC-CMV',
  'VC-SIMV': 'VC-SIMV',
};

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
