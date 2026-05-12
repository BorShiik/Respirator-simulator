export interface Room {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

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

export type AsynchronyType = 
  | 'INEFFECTIVE_TRIGGER'
  | 'DOUBLE_TRIGGER'
  | 'AUTO_TRIGGER'
  | 'DELAYED_CYCLING'
  | 'PREMATURE_CYCLING'
  | 'FLOW_MISMATCH'
  | 'REVERSE_TRIGGER';

export interface AsynchronyStatus {
  active: boolean;
  type: AsynchronyType | null;
}

export type StationStatus = 'online' | 'offline' | 'error';

export interface Station {
  id: string;
  name: string;
  status: StationStatus;
  traineeId: string | null;
  traineeName: string | null;
  currentScenarioId: string | null;
  currentScenarioName: string | null;
  settings: VentilatorSettings | null;
  asynchrony: AsynchronyStatus | null;
  lastUpdate: number;
}

export interface StationLiveStatus {
  stationId: string;
  status: StationStatus;
  isRunning?: boolean;
  settings: VentilatorSettings | null;
  asynchrony: AsynchronyStatus | null;
  pressure: number[];
  flow: number[];
  volume: number[];
  scenarioName?: string;
  studentName?: string;
  assignedAsynchronyType?: AsynchronyType | null;
  lastUpdate: number;
}

export type BlockType = 'NORMAL' | 'ASYNCHRONY';

export interface ScenarioBlock {
  id: string;
  type: BlockType;
  startTime: number;
  duration: number;
  description: string;
  parameterChanges: Partial<VentilatorSettings>;
  asynchronyType?: AsynchronyType;
  resistance?: number;
  compliance?: number;
  // Patient parameters (ILSim-style)
  rin?: number;
  rout?: number;
  p01?: number;
  Tcykl?: number;
  PTi?: number;
  PriorityPR?: number;
  PressureRaiseT?: number;
  DoubleTriggeringTime?: number;
  knobDisable?: boolean;
}

export interface PatientParams {
  rin: number;
  rout: number;
  p01: number;
  Tcykl: number;
  PTi: number;
  PriorityPR: number;
  PressureRaiseT: number;
  DoubleTriggeringTime: number;
  knobDisable: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  estimatedDuration: number;
  initialSettings: VentilatorSettings;
  initialResistance: number;
  initialCompliance: number;
  initialPatientParams: PatientParams;
  blocks: ScenarioBlock[];
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  stationId: string;
  traineeId: string;
  traineeName: string;
  scenarioId: string;
  scenarioName: string;
  roomId: string | null;
  startTime: number;
  endTime: number | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | 'PENDING';
  metrics: SessionMetrics | null;
}

export interface SessionMetrics {
  totalDuration: number;
  timeToResolveAsynchrony: number | null;
  numberOfSettingChanges: number;
  chaosIndex: number;
  asynchronyDetected: boolean;
  asynchronyTypes: AsynchronyType[];
  successfulResolution: boolean;
}

export interface SessionTimeline {
  timestamp: number;
  event: 'SETTING_CHANGE' | 'ASYNCHRONY_START' | 'ASYNCHRONY_END' | 'SESSION_START' | 'SESSION_END';
  details: Record<string, unknown>;
}

export interface SessionDetails extends Session {
  timeline: SessionTimeline[];
}

export interface TrainerWebSocketMessage {
  type: 'stationUpdate' | 'stationsSnapshot';
  stations?: StationLiveStatus[];
  station?: StationLiveStatus;
}

export type CommandType = 'reset' | 'pause' | 'continue';

export interface CommandRequest {
  command: CommandType;
}

export interface CommandResponse {
  success: boolean;
  message: string;
}

export interface AssignScenarioRequest {
  scenarioId: string;
}

export interface LearningCurveDataPoint {
  sessionIndex: number;
  scenarioName: string;
  date: string;
  timeToResolve: number | null;
  settingChanges: number;
  successful: boolean;
}

export const ASYNCHRONY_LABELS: Record<AsynchronyType, string> = {
  INEFFECTIVE_TRIGGER: 'Nieefektywny wyzwalacz',
  DOUBLE_TRIGGER: 'Podwójny wyzwalacz',
  AUTO_TRIGGER: 'Autowyzwalacz',
  DELAYED_CYCLING: 'Opóźnione przełączenie',
  PREMATURE_CYCLING: 'Przedwczesne przełączenie',
  FLOW_MISMATCH: 'Niedopasowanie przepływu',
  REVERSE_TRIGGER: 'Odwrócony wyzwalacz',
};

export const MODE_LABELS: Record<VentilatorMode, string> = {
  'PC-CMV': 'PC-CMV',
  'PC-SIMV': 'PC-SIMV',
  'PSV': 'PSV',
  'CPAP': 'CPAP',
  'VC-CMV': 'VC-CMV',
  'VC-SIMV': 'VC-SIMV',
};

export const DIFFICULTY_LABELS: Record<Scenario['difficulty'], string> = {
  EASY: 'Łatwy',
  MEDIUM: 'Średni',
  HARD: 'Trudny',
};

export const DIFFICULTY_COLORS: Record<Scenario['difficulty'], string> = {
  EASY: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HARD: 'bg-red-100 text-red-800',
};

export const DEFAULT_SETTINGS: VentilatorSettings = {
  ipap: 12,
  epap: 4,
  peep: 4,
  rr: 15,
  ti: 1.0,
  trigger: 2,
  vt: 500,
  pinsp: 12,
  mode: 'PC-CMV',
};

export const DEFAULT_PATIENT_PARAMS: PatientParams = {
  rin: 1,
  rout: 20,
  p01: 0,
  Tcykl: 3.0,
  PTi: 1.0,
  PriorityPR: 0,
  PressureRaiseT: 0,
  DoubleTriggeringTime: 0,
  knobDisable: false,
};

export const DEFAULT_SCENARIO: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  difficulty: 'EASY',
  estimatedDuration: 300,
  initialSettings: DEFAULT_SETTINGS,
  initialResistance: 10,
  initialCompliance: 50,
  initialPatientParams: DEFAULT_PATIENT_PARAMS,
  blocks: [],
};
