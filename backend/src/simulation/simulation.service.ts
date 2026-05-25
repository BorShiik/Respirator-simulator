import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  VentilatorSettings,
  PatientModel,
  AsynchronyStatus,
  AsynchronyType,
  TelemetryData,
  DEFAULT_SETTINGS,
  DEFAULT_PATIENT,
} from '../common/dto/ventilator.dto';

interface SimulationState {
  time: number;           // Current simulation time in seconds (resets each cycle — physics only)
  totalTime: number;      // Monotonically increasing time (like ILSim _serviceRunTime) — for scenarios
  breathTime: number;     // Time for patient breathing cycle (Pmus)
  breathCount: number;
  breath: boolean;        // ILSim breath flag — prevents re-triggering within same patient cycle

  currentPressure: number; // Pp — alveolar pressure (cmH2O)
  currentFlow: number;     // dUp — net flow (L/s)
  currentVolume: number;   // Up — integrated volume (L)
  musclePressure: number;  // Pmus (cmH2O)
  alveolarPressure: number; // Pp (cmH2O)
  dUp: number;             // Flow derivative for numerical integration

  // Cached physics constants (recalculated at cycle start)
  denominator: number;
  raisingForce: number;
  T: number;               // Breath period (seconds), = 60/PR or 60/PriorityPR

  settings: VentilatorSettings;
  patient: PatientModel;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
  difficulty: string;
  scenarioBlocks?: any[];

  // Asynchrony resolution tracking
  baselineSettings: VentilatorSettings | null;
  baselinePatient: PatientModel | null;
  currentAsynchronyEvent: any | null;

  // Scenario completion tracking
  scenarioDuration: number;       // Total scenario duration (seconds), 0 = unlimited
  scenarioCompleted: boolean;     // Whether the scenario has completed
  scenarioCompletesAt: number;    // Scheduled early-completion time (totalTime value), 0 = not scheduled

  // Telemetry Buffers
  pressureBuffer: number[];
  flowBuffer: number[];
  volumeBuffer: number[];
  payloadBuffer: { time: number; pressure: number; flow: number; volume: number }[];
  filteredPressure?: number;
  filteredFlow?: number;

  // NIV / VEXP (ILSim metrics)
  NIV: number;
  VEXP: number;
}

@Injectable()
export class SimulationService extends EventEmitter {
  private states: Map<string, SimulationState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (data: TelemetryData) => void> = new Map();

  // Sampling rate — ILSim uses h=0.1 (10 Hz), but we need 50Hz (0.02) for realistic medical waveforms
  private readonly SAMPLE_RATE = 50;
  private readonly DT = 0.02;

  /**
   * Start simulation for a station
   */
  startSimulation(
    stationId: string,
    scenarioName: string,
    onTelemetry: (data: TelemetryData) => void,
  ): void {
    this.stopSimulation(stationId);

    const existingState = this.states.get(stationId);
    const preservedBlocks = (existingState && existingState.scenarioName === scenarioName)
      ? existingState.scenarioBlocks
      : [];

    const settings = { ...DEFAULT_SETTINGS };
    const patient = { ...DEFAULT_PATIENT };

    // Calculate initial T
    const T = this.roundTo(60 / settings.rr, 2);

    // Calculate initial physics state (like ILSim leakingBreathCPAPSTInit)
    const R = patient.resistance;
    const Rin = patient.rin;
    const Rout = patient.rout;
    const C = patient.compliance / 1000;
    const denominator = (1/R + 1/Rin + 1/Rout);
    const Pp0 = (settings.ipap / Rin) / denominator;
    const dUp0 = Pp0 / Rout;

    const state: SimulationState = {
      time: 0,
      totalTime: 0,
      breathTime: 0.02, // ILSim initializes breathTime to DT
      breathCount: 0,
      breath: false,
      currentPressure: settings.peep,
      currentFlow: 0,
      currentVolume: 0,
      musclePressure: 0,
      alveolarPressure: settings.peep,
      dUp: dUp0,
      denominator,
      raisingForce: 0,
      T,
      settings,
      patient,
      asynchrony: { active: false, type: null },
      scenarioName,
      difficulty: 'EASY',
      scenarioBlocks: preservedBlocks,
      baselineSettings: null,
      baselinePatient: null,
      currentAsynchronyEvent: null,
      scenarioDuration: 0,
      scenarioCompleted: false,
      scenarioCompletesAt: 0,
      pressureBuffer: [],
      flowBuffer: [],
      volumeBuffer: [],
      payloadBuffer: [],
      filteredPressure: settings.peep,
      filteredFlow: 0,
      NIV: 0,
      VEXP: 0,
    };

    this.states.set(stationId, state);
    this.callbacks.set(stationId, onTelemetry);

    const interval = setInterval(() => {
      this.simulationTick(stationId);
    }, this.DT * 1000);

    this.intervals.set(stationId, interval);
  }

  /**
   * Stop simulation for a station
   */
  stopSimulation(stationId: string): void {
    const interval = this.intervals.get(stationId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(stationId);
    }
    this.states.delete(stationId);
    this.callbacks.delete(stationId);
  }

  /**
   * Pause simulation for a station
   */
  pauseSimulation(stationId: string): void {
    const interval = this.intervals.get(stationId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(stationId);
    }
  }

  /**
   * Resume simulation for a station
   */
  resumeSimulation(stationId: string): void {
    if (this.intervals.has(stationId)) return;
    const state = this.states.get(stationId);
    if (!state) return;

    const interval = setInterval(() => {
      this.simulationTick(stationId);
    }, this.DT * 1000);

    this.intervals.set(stationId, interval);
  }

  /**
   * Reset simulation for a station without changing scenario or settings
   */
  resetSimulation(stationId: string): void {
    const state = this.states.get(stationId);
    if (!state) return;

    // Reset physics and time
    this.leakingBreathCPAPSTInit(state, true);
    state.totalTime = 0;
    state.breathCount = 0;
    state.scenarioCompleted = false;
    state.scenarioCompletesAt = 0;
    state.pressureBuffer = [];
    state.flowBuffer = [];
    state.volumeBuffer = [];
    state.payloadBuffer = [];
    state.filteredPressure = state.settings.peep;
    state.filteredFlow = 0;

    // Reset scenario blocks so they can be re-applied
    if (state.scenarioBlocks) {
      for (const block of state.scenarioBlocks) {
        block._applied = false;
        block._resolved = false;
      }
    }

    // Clear any active asynchrony so it can be re-triggered by the timeline
    if (state.asynchrony.active) {
       this.injectAsynchrony(stationId, null);
    }
  }

  /**
   * Update ventilator settings
   */
  updateSettings(stationId: string, settings: Partial<VentilatorSettings>): void {
    const state = this.states.get(stationId);
    if (!state) return;

    for (const key of Object.keys(settings)) {
       const typedKey = key as keyof VentilatorSettings;
       if (state.settings[typedKey] !== settings[typedKey]) {
           const prev = state.settings[typedKey] as number;
           const curr = settings[typedKey] as number;
           this.emit('setting_changed', stationId, typedKey, prev, curr, state.asynchrony.active, state.asynchrony.type);
       }
    }

    state.settings = { ...state.settings, ...settings };
    this.emit('settings_updated', stationId, state.settings);
  }

  /**
   * Update patient parameters with sanitization
   */
  updatePatientParameters(stationId: string, parameters: Partial<PatientModel>): void {
    const state = this.states.get(stationId);
    if (!state) return;

    if (parameters.resistance !== undefined) {
      state.patient.resistance = Math.max(0.5, parameters.resistance);
    }
    if (parameters.compliance !== undefined) {
      state.patient.compliance = Math.max(1, parameters.compliance);
    }
    if (parameters.effort !== undefined) state.patient.effort = Math.max(0, parameters.effort);
    if (parameters.spontaneousRate !== undefined) state.patient.spontaneousRate = Math.max(0, parameters.spontaneousRate);
    if (parameters.rin !== undefined) state.patient.rin = Math.max(0.1, parameters.rin);
    if (parameters.rout !== undefined) state.patient.rout = Math.max(0.1, parameters.rout);
    if (parameters.p01 !== undefined) state.patient.p01 = Math.max(0, parameters.p01);
    if (parameters.Tcykl !== undefined) state.patient.Tcykl = Math.max(0.5, parameters.Tcykl);
    if (parameters.PTi !== undefined) state.patient.PTi = Math.max(0, parameters.PTi);
    if (parameters.PriorityPR !== undefined) state.patient.PriorityPR = Math.max(0, parameters.PriorityPR);
    if (parameters.PressureRaiseT !== undefined) state.patient.PressureRaiseT = Math.max(0, parameters.PressureRaiseT);
    if (parameters.DoubleTriggeringTime !== undefined) state.patient.DoubleTriggeringTime = Math.max(0, parameters.DoubleTriggeringTime);
    if (parameters.knobDisable !== undefined) state.patient.knobDisable = parameters.knobDisable;

    this.emit('patient_updated', stationId, state.patient);
  }

  /**
   * Apply scenario events scheduled timeline
   */
  applyScenarioEvents(stationId: string, blocks: any[], durationSeconds: number = 0): void {
     const state = this.states.get(stationId);
     if (state) {
        console.log(`[SimulationService] Applied ${blocks.length} scenario blocks (duration=${durationSeconds}s) for ${stationId}:`,
          blocks.map(b => `${b.type}(${b.asynchronyType || 'normal'} @ ${b.startTime}s)`).join(', '));
        state.scenarioBlocks = [...blocks];
        state.scenarioDuration = durationSeconds;
        state.scenarioCompleted = false;
        state.scenarioCompletesAt = 0;
        state.time = 0;
        state.totalTime = 0;
        state.breathTime = 0.02;
        state.breathCount = 0;
        state.breath = false;
        state.asynchrony = { active: false, type: null };
        state.baselineSettings = null;
        state.baselinePatient = null;
        state.currentAsynchronyEvent = null;
     }
  }

  /**
   * Get current state
   */
  getState(stationId: string): SimulationState | undefined {
    return this.states.get(stationId);
  }

  /**
   * Check if simulation is running
   */
  isSimulationRunning(stationId: string): boolean {
    return this.intervals.has(stationId);
  }

  /**
   * Inject asynchrony
   */
  injectAsynchrony(stationId: string, type: AsynchronyType | null): void {
    const state = this.states.get(stationId);
    if (!state) return;

    if (type !== null && state.asynchrony.type !== type) {
      state.asynchrony = { active: true, type };
      state.baselineSettings = { ...state.settings };
      state.baselinePatient = { ...state.patient };
      state.currentAsynchronyEvent = null;

      // ─── baseline: moderately stiff lung, patient effort ────
      // R=12, C=40 → τ=0.48s, allows Pp to track IPAP within ~85-95%
      // rout=8 provides realistic passive expiration
      state.patient.resistance = 12;
      state.patient.compliance = 40;
      state.patient.rin = 1;
      state.patient.rout = 8;
      state.patient.p01 = 2;
      state.patient.Tcykl = 3.0;
      state.patient.PTi = 1.0;
      state.patient.PriorityPR = 0;
      state.patient.PressureRaiseT = 0;
      state.patient.DoubleTriggeringTime = 0;

      switch (type) {
        case 'INEFFECTIVE_TRIGGER':
          // Patient has moderate effort. Raise trigger threshold to 15 (very insensitive)
          // so the ventilator cannot detect patient effort (Pmax clamped to trigger*0.8)
          // Student must lower trigger to fix.
          state.patient.p01 = 1.5;
          state.patient.Tcykl = 3.0;
          state.patient.PTi = 1.0;
          state.settings.trigger = 15;
          break;
        case 'AUTO_TRIGGER':
          // Flow trigger is simulated organically by sloshing water:
          // A low-frequency flow disturbance is added to dUp in simulationTick.
          state.patient.p01 = 0; // Patient is passive
          state.patient.effort = 0;
          break;
        case 'DOUBLE_TRIGGER':
          // Patient has long neural Ti and strong inspiratory effort
          state.patient.p01 = 5.0;
          state.patient.PTi = state.settings.ti * 1.6;
          state.patient.Tcykl = 4.0;
          break;
        case 'DELAYED_CYCLING':
          // Short neural Ti, patient transitions to active expiration (resists the machine)
          state.patient.p01 = 3.0;
          state.patient.PTi = state.settings.ti * 0.4;
          state.patient.Tcykl = 3.0;
          break;
        case 'PREMATURE_CYCLING':
          // Patient neural Ti is longer than machine Ti, patient continues drawing flow
          state.patient.p01 = 3.5;
          state.patient.PTi = state.settings.ti * 2.0;
          state.patient.Tcykl = 4.0;
          break;
        case 'FLOW_MISMATCH':
          // VC-CMV mode flow mismatch (Flow Starvation)
          // High patient effort vs. low machine flow limit (30 L/min)
          state.patient.p01 = 8.0;
          state.patient.effort = 95;
          state.patient.PTi = 1.0;
          state.patient.Tcykl = 4.0;
          break;
        case 'REVERSE_TRIGGER':
          // Machine triggers CMV, patient effort is entrained with a 0.4s delay
          state.patient.p01 = 5.0;
          state.patient.effort = 100;
          state.patient.PTi = 0.8;
          state.patient.Tcykl = 4.0;
          break;
      }

      this.emit('asynchrony_injected', stationId, type);
      if (type === 'INEFFECTIVE_TRIGGER') {
        this.emit('settings_updated', stationId, state.settings);
      }
    } else if (type === null) {
      const settingsChanged = !!state.baselineSettings;
      if (state.baselineSettings) {
        state.settings = { ...state.baselineSettings };
      }
      if (state.baselinePatient) {
        state.patient = { ...state.baselinePatient };
      }
      state.asynchrony = { active: false, type: null };
      state.baselineSettings = null;
      state.baselinePatient = null;
      state.currentAsynchronyEvent = null;
      if (settingsChanged) {
        this.emit('settings_updated', stationId, state.settings);
      }
    }
  }

  /**
   * Check if student fixed the asynchrony by adjusting settings
   */
  private checkIfAsynchronyFixed(state: SimulationState): boolean {
    if (!state.asynchrony.active || !state.asynchrony.type || !state.baselineSettings) return false;

    const current = state.settings;
    const base = state.baselineSettings;

    switch (state.asynchrony.type) {
      case 'INEFFECTIVE_TRIGGER':
        // Backend forces trigger=15. Student needs to lower it significantly (e.g. back towards baseline)
        // Resolution: student lowered trigger by at least 5 from the forced value, or lowered IPAP
        const targetTrigger = base.trigger >= 12 ? 3.0 : base.trigger + 1;
        return current.trigger <= targetTrigger || current.ipap <= base.ipap - 2 + 0.001;
      case 'AUTO_TRIGGER':
        return current.trigger >= base.trigger + 1.0 - 0.001;
      case 'DELAYED_CYCLING':
        return current.ti <= base.ti - 0.2 + 0.001;
      case 'PREMATURE_CYCLING':
        return current.ti >= base.ti + 0.2 - 0.001;
      case 'DOUBLE_TRIGGER':
        // Student can increase Ti or VT
        return current.ti >= base.ti + 0.2 - 0.001 || (current.vt !== undefined && base.vt !== undefined && current.vt >= base.vt + 50);
      case 'FLOW_MISMATCH':
        return current.ipap >= base.ipap + 2 - 0.001;
      case 'REVERSE_TRIGGER':
        // Break entrainment by changing RR significantly (e.g. increase or decrease by 3)
        return Math.abs(current.rr - base.rr) >= 3;
      default:
        return false;
    }
  }

  // ─── ILSim-equivalent: leakingBreathCPAPSTInit ─────────────────────
  private leakingBreathCPAPSTInit(state: SimulationState, breathReset: boolean = true): void {
    state.breath = false;
    state.time = 0;

    if (breathReset) {
      state.breathTime = 0.02;
    }

    // Recalculate physics constants from current parameters
    const R = state.patient.resistance;
    const Rin = state.patient.rin;
    const Rout = state.patient.rout;
    const C = state.patient.compliance / 1000;

    state.denominator = (1/R + 1/Rin + 1/Rout);

    // Calculate T
    if (state.patient.PriorityPR !== 0) {
      state.T = this.roundTo(60 / state.patient.PriorityPR, 2);
    } else {
      state.T = this.roundTo(60 / state.settings.rr, 2);
    }

    // Initial alveolar pressure from IPAP
    const Pp = (state.settings.ipap / Rin) / state.denominator;
    state.dUp = Pp / Rout;
    state.currentVolume = 0;
  }

  // ─── ILSim-equivalent: startNewCycle ───────────────────────────────
  private startNewCycle(state: SimulationState, breathReset: boolean = true): void {
    this.leakingBreathCPAPSTInit(state, breathReset);

    // Recalculate T with PriorityPR override
    if (state.patient.PriorityPR !== 0) {
      state.T = this.roundTo(60 / state.patient.PriorityPR, 2);
    } else {
      state.T = this.roundTo(60 / state.settings.rr, 2);
    }

    // Recalculate denominator
    const R = state.patient.resistance;
    const Rin = state.patient.rin;
    const Rout = state.patient.rout;
    state.denominator = (1/R + 1/Rin + 1/Rout);

    // Reset dUp after init (ILSim does this)
    state.dUp = 0;

    // Calculate raising_force for PressureRaiseT
    if (state.patient.PressureRaiseT !== 0) {
      state.raisingForce = (state.settings.ipap - state.settings.epap) * this.DT / state.patient.PressureRaiseT;
    }

    state.breath = true;
    state.breathCount++;
  }

  /**
   * Main simulation tick — follows ILSim nextLeakingBreathCPAPST exactly
   */
  private simulationTick(stationId: string): void {
    const state = this.states.get(stationId);
    const callback = this.callbacks.get(stationId);
    if (!state || !callback) return;

    // Recalculate denominator to ensure physical parameters are always fresh
    state.denominator = (1 / state.patient.resistance + 1 / state.patient.rin + 1 / state.patient.rout);

    // ─── 1. Check for new cycle start (ILSim: time % T == 0) ────────
    const isSpontaneousMode = state.settings.mode === 'PSV' || state.settings.mode === 'CPAP';
    if (!isSpontaneousMode && this.roundTo(state.time, 2) % this.roundTo(state.T, 2) === 0.0) {
      this.startNewCycle(state, false);
    }

    // ─── 2. Calculate actual_cycle_time ──────────────────────────────
    let actual_cycle_time = this.roundTo(state.time, 2);
    if (!isSpontaneousMode) {
      actual_cycle_time = actual_cycle_time % this.roundTo(state.T, 2);
    }

    // ─── 4. Patient breath cycle reset (ILSim breath flag) ───────────
    if (this.roundTo(
          this.roundTo(state.breathTime, 2) % this.roundTo(state.patient.Tcykl, 2),
        2) === 0) {
      state.breath = false;
    }

    // ─── Closures for RK4 Solver ────────────────────────────────────
    const getPin = (tC: number): number => {
      let pIn = tC >= state.settings.ti ? state.settings.epap : state.settings.ipap;
      
      if (state.patient.PressureRaiseT > tC && state.patient.PressureRaiseT !== 0) {
        pIn = state.settings.epap + (state.settings.ipap - state.settings.epap) * tC / state.patient.PressureRaiseT;
      }
      
      if (tC >= state.patient.DoubleTriggeringTime && state.patient.DoubleTriggeringTime !== 0) {
        pIn = state.settings.epap;
      }
      
      return pIn;
    };

    const getPmus = (tB: number, tC: number): number => {
      if (state.patient.p01 === 0) return 0;

      const fv = 60 / state.patient.Tcykl;
      let Pmax = state.patient.p01 / (1 - Math.exp(-(0.1 * (fv + 4 * state.patient.p01)) / 10));

      // INEFFECTIVE_TRIGGER: clamp Pmax below the trigger sensitivity threshold
      if (state.asynchrony.active && state.asynchrony.type === 'INEFFECTIVE_TRIGGER') {
        Pmax = Math.min(Pmax, state.settings.trigger * 0.8);
      }

      // REVERSE_TRIGGER: patient effort is entrained with a reflex delay after machine breath start
      if (state.asynchrony.active && state.asynchrony.type === 'REVERSE_TRIGGER') {
        const delay = 0.4;
        if (tC >= delay && tC < delay + state.patient.PTi) {
          const tActive = tC - delay;
          const PmaxReverse = Pmax * 1.5;
          return PmaxReverse * Math.sin((Math.PI * tActive) / state.patient.PTi) ** 2;
        }
        return 0;
      }

      const tBreathCycle = tB % state.patient.Tcykl;
      const TiNeural = state.patient.PTi;

      if (tBreathCycle < TiNeural) {
        // Smooth physiological sin^2 diaphragm contraction
        return Pmax * Math.sin((Math.PI * tBreathCycle) / TiNeural) ** 2;
      } else {
        // DELAYED_CYCLING: active expiratory muscle effort during terminal machine inspiration
        if (state.asynchrony.active && 
            state.asynchrony.type === 'DELAYED_CYCLING' && 
            tC < state.settings.ti) {
          const Texp = state.settings.ti - TiNeural;
          if (Texp > 0) {
            const tActiveExp = tBreathCycle - TiNeural;
            const PmaxExp = Pmax * 0.6;
            return -PmaxExp * Math.sin((Math.PI * tActiveExp) / Texp) ** 2;
          }
        }
        return 0;
      }
    };

    const getDerivative = (tC: number, tB: number, vol: number): { dV: number; Pp: number } => {
      const R = state.patient.resistance;
      const Rin = state.patient.rin;
      const Rout = state.patient.rout;
      const C = state.patient.compliance / 1000;
      
      const isVC = state.settings.mode.startsWith('VC-');
      const isInspiration = tC < state.settings.ti;
      
      const Pm = getPmus(tB, tC);
      
      if (isVC && isInspiration) {
        // VC mode inspiration: constant flow
        const targetFlow = state.asynchrony.active && state.asynchrony.type === 'FLOW_MISMATCH'
          ? 0.5
          : (state.settings.vt / 1000) / state.settings.ti; // L/s
        
        const denomVC = 1/R + 1/Rout;
        const Pp = ( (vol / C - Pm) / R + targetFlow ) / denomVC;
        const Iout = Pp / Rout;
        return { dV: targetFlow - Iout, Pp };
      } else {
        // PC mode or expiration: pressure driven
        const pIn = getPin(tC);
        const Pp = (vol / (R * C) + pIn / Rin - Pm / R) / state.denominator;
        const Iout = Pp / Rout;
        const Iin = (pIn - Pp) / Rin;
        return { dV: Iin - Iout, Pp };
      }
    };

    // ─── 5. Calculate current Pmus for trigger evaluation ────────────
    const Pm = getPmus(state.breathTime, actual_cycle_time);
    state.musclePressure = Pm;

    // ─── 6. Patient trigger evaluation ───────────────────────────────
    let isTriggered = false;
    let slosh = 0;
    if (state.asynchrony.active && state.asynchrony.type === 'AUTO_TRIGGER') {
      slosh = 2.8 * Math.sin(2 * Math.PI * 3 * state.totalTime); // in L/min (overlay condensate wave)
    }

    if (state.asynchrony.active && state.asynchrony.type === 'REVERSE_TRIGGER') {
      // Entrained reflex effort does not trigger a new ventilator cycle
      isTriggered = false;
    } else {
      // A: Spontaneous trigger
      if (Math.abs(Pm) > state.settings.trigger && !state.breath) {
        isTriggered = true;
      }
      // B: Double trigger (trigger a second breath during active effort at expiratory phase transition)
      if (!isTriggered && 
          actual_cycle_time >= state.settings.ti + 0.1 && 
          Math.abs(Pm) > state.settings.trigger) {
        isTriggered = true;
      }
      // C: Auto trigger (periodic condensate flow oscillation crosses flow trigger threshold)
      if (!isTriggered && 
          state.asynchrony.active && 
          state.asynchrony.type === 'AUTO_TRIGGER' && 
          actual_cycle_time >= state.settings.ti &&
          slosh > state.settings.trigger) {
        isTriggered = true;
      }
    }

    if (isTriggered) {
      this.startNewCycle(state, false);
      state.breath = true;
      actual_cycle_time = this.roundTo(state.time, 2);
      if (!isSpontaneousMode) {
        actual_cycle_time = actual_cycle_time % this.roundTo(state.T, 2);
      }
    }

    // ─── 9. RK4 Integration for Volume ───────────────────────────────
    const V0 = state.currentVolume;
    const dt = this.DT;

    const res1 = getDerivative(actual_cycle_time, state.breathTime, V0);
    const k1 = res1.dV;

    const res2 = getDerivative(actual_cycle_time + dt / 2, state.breathTime + dt / 2, V0 + k1 * dt / 2);
    const k2 = res2.dV;

    const res3 = getDerivative(actual_cycle_time + dt / 2, state.breathTime + dt / 2, V0 + k2 * dt / 2);
    const k3 = res3.dV;

    const res4 = getDerivative(actual_cycle_time + dt, state.breathTime + dt, V0 + k3 * dt);
    const k4 = res4.dV;

    // Integrated volume (clamped to prevent numerical negatives)
    const V_new = Math.max(0, V0 + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4));

    // Evaluate final physics state at the end of the time step
    const finalRes = getDerivative(actual_cycle_time + dt, state.breathTime + dt, V_new);
    const Pp_new = finalRes.Pp;
    const dV_new = finalRes.dV;
    const Pm_new = getPmus(state.breathTime + dt, actual_cycle_time + dt);

    // ─── 13. Advance time parameters ─────────────────────────────────
    state.time += dt;
    state.breathTime += dt;
    state.totalTime = this.roundTo(state.totalTime + dt, 2);

    // ─── 14. Update state parameters ─────────────────────────────────
    state.currentVolume = V_new;
    state.alveolarPressure = Pp_new;
    state.dUp = dV_new;
    state.musclePressure = Pm_new;
    state.currentPressure = Pp_new;
    state.currentFlow = dV_new;

    // ─── 15. Process scheduled scenario events ───────────────────────
    this.processScheduledEvents(stationId, state);

    // ─── 16. Check if student fixed the asynchrony ───────────────────
    if (this.checkIfAsynchronyFixed(state)) {
       const resolvedType = state.asynchrony.type;
       // Restore only force-changed settings (keep student's intentional fixes)
       if (state.baselineSettings && resolvedType === 'INEFFECTIVE_TRIGGER') {
         // Trigger was forced to 15 — do NOT restore it (student lowered it to fix the issue)
         // But restore any other settings that weren't part of the fix
       }
       if (state.baselinePatient) {
         state.patient = { ...state.baselinePatient };
       }
       state.asynchrony = { active: false, type: null };
       state.baselineSettings = null;
       state.baselinePatient = null;

       const resolvedBlock = state.currentAsynchronyEvent;
       if (resolvedBlock) {
          resolvedBlock._resolved = true;
       }
       state.currentAsynchronyEvent = null;
       this.emit('asynchrony_resolved', stationId, resolvedType);

       // ─── Dynamic block progression: advance to next async after 5s ──
       if (state.scenarioBlocks && resolvedBlock) {
         const nextAsyncBlock = state.scenarioBlocks.find(b =>
           b.type === 'ASYNCHRONY' &&
           !b._resolved &&
           b.startTime > resolvedBlock.startTime
         );

         if (nextAsyncBlock) {
           const earlyStart = state.totalTime + 5;
           if (earlyStart < nextAsyncBlock.startTime) {
             console.log(`[SimulationService] Early resolution! Moving next async from ${nextAsyncBlock.startTime}s to ${earlyStart.toFixed(1)}s`);
             nextAsyncBlock.startTime = earlyStart;
           }
         } else {
           state.scenarioCompletesAt = state.totalTime + 5;
           console.log(`[SimulationService] All asynchronies resolved! Scenario completes at ${state.scenarioCompletesAt.toFixed(1)}s`);
         }
       }
    }

    // ─── 17. Filter and buffer telemetry ─────────────────────────────
    // Airway pressure sensor displays alveolar pressure minus muscle pressure dip (servo impedance)
    const R_SERVO_FACTOR = 0.3;
    const rawDisplayPressure = Pp_new - Pm_new * R_SERVO_FACTOR;

    // Add low-level valve white noise to flow
    const noise = (Math.random() - 0.5) * 0.015; // in L/s
    const rawFlowWithNoise = dV_new + noise;

    // Apply EMA filter (alpha = 0.25)
    const alpha = 0.25;
    state.filteredPressure = alpha * rawDisplayPressure + (1 - alpha) * (state.filteredPressure ?? rawDisplayPressure);
    state.filteredFlow = alpha * rawFlowWithNoise + (1 - alpha) * (state.filteredFlow ?? rawFlowWithNoise);

    const finalPressure = state.filteredPressure;
    const finalFlow = state.filteredFlow + (slosh / 60); // overlay auto-trigger condensate wave

    // Populate buffers
    state.pressureBuffer.push(Math.round(finalPressure * 10) / 10);
    state.flowBuffer.push(Math.round(finalFlow * 60 * 10) / 10);
    state.volumeBuffer.push(Math.round(state.currentVolume * 1000));
    state.payloadBuffer.push({
      time: state.totalTime,
      pressure: Math.round(finalPressure * 10) / 10,
      flow: Math.round(finalFlow * 60 * 10) / 10,
      volume: Math.round(state.currentVolume * 1000),
    });

    if (state.payloadBuffer.length >= 5) {
      const telemetry: TelemetryData = {
        timestamp: Date.now(),
        pressure: [...state.pressureBuffer],
        flow: [...state.flowBuffer],
        volume: [...state.volumeBuffer],
        data: [...state.payloadBuffer],
        settings: state.settings,
        asynchrony: state.asynchrony,
        scenarioName: state.scenarioName,
        difficulty: state.difficulty,
        totalTime: state.totalTime,
        scenarioDuration: state.scenarioDuration,
        scenarioCompleted: state.scenarioCompleted,
      };

      callback(telemetry);

      state.pressureBuffer = [];
      state.flowBuffer = [];
      state.volumeBuffer = [];
      state.payloadBuffer = [];
    }
  }

  /**
   * Calculate Muscle Pressure (Pmus) — exact ILSim implementation.
   * P01 is passed directly (no effort scaling — ILSim has no effort parameter).
   */
  private calculateMusclePressure(
    P01: number,
    time: number,
    PmusTime: number,
    Ti: number,
    noise: boolean = false,
  ): number {
    if (P01 === 0) return 0;

    const fv = 60 / PmusTime;
    const TiLoc = Ti !== 0 ? Ti : (0.0125 * fv + 0.125) * PmusTime;

    const Pmax = P01 / (1 - Math.exp(-(0.1 * (fv + 4 * P01)) / 10));

    const t = this.roundTo(time % PmusTime, 2);
    let lung = 0;

    const kRise = (fv + 4 * P01) / 10;
    const kFall = (fv + P01 / 2) / 10;

    if (t <= TiLoc) {
      lung = Pmax * (1 - Math.exp(-kRise * t));
    } else {
      const peakValue = Pmax * (1 - Math.exp(-kRise * TiLoc));
      lung = peakValue * Math.exp(-kFall * (t - TiLoc));
    }

    if (noise) {
      lung += this.addNoise(Pmax, 2);
    }

    return lung;
  }

  private addNoise(value: number, percent: number): number {
    const noise = Math.random() * (value / 100 * percent);
    return Math.random() > 0.5 ? noise : -noise;
  }

  private roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private processScheduledEvents(stationId: string, state: SimulationState): void {
     if (!state.scenarioBlocks || state.scenarioBlocks.length === 0) return;
     if (state.scenarioCompleted) return; // Already completed — skip processing

     const currentTime = state.totalTime;

     let expectedAsynchronyType: AsynchronyType | null = null;
     let activeBlock: any = null;

     for (const iterBlock of state.scenarioBlocks) {
         if (iterBlock.type === 'ASYNCHRONY' && iterBlock.asynchronyType && !iterBlock._resolved) {
             const startTime = iterBlock.startTime;
             const duration = iterBlock.duration || 30;
             const endTime = startTime + duration;

             if (currentTime >= startTime && currentTime <= endTime) {
                 expectedAsynchronyType = iterBlock.asynchronyType;
                 activeBlock = iterBlock;
                 break;
             }
         }
     }

     if (expectedAsynchronyType) {
         if (state.asynchrony.type !== expectedAsynchronyType) {
             console.log(`[SimulationService] Scheduled asynchrony ${expectedAsynchronyType} activated at t=${currentTime.toFixed(1)}s for ${stationId}`);
             this.injectAsynchrony(stationId, expectedAsynchronyType);
             state.currentAsynchronyEvent = activeBlock;
         } else if (!state.currentAsynchronyEvent) {
             state.currentAsynchronyEvent = activeBlock;
         }
     } else if (state.asynchrony.active && state.currentAsynchronyEvent) {
         const expiredType = state.asynchrony.type;
         state.currentAsynchronyEvent._resolved = true;
         this.injectAsynchrony(stationId, null);
         this.emit('asynchrony_resolved', stationId, expiredType);
     }

     // ─── Scenario completion checks ─────────────────────────────────
     // Path A: Early completion — all asynchronies resolved, 5s cooldown passed
     if (state.scenarioCompletesAt > 0 && currentTime >= state.scenarioCompletesAt) {
       state.scenarioCompleted = true;
       if (state.asynchrony.active) this.injectAsynchrony(stationId, null);
       console.log(`[SimulationService] Scenario '${state.scenarioName}' COMPLETED (all asynchronies resolved) at t=${currentTime.toFixed(1)}s`);
       this.emit('scenario_completed', stationId, state.scenarioName);
       return;
     }
     // Path B: Natural completion — durationSeconds elapsed
     if (state.scenarioDuration > 0 && currentTime >= state.scenarioDuration) {
       state.scenarioCompleted = true;
       if (state.asynchrony.active) this.injectAsynchrony(stationId, null);
       console.log(`[SimulationService] Scenario '${state.scenarioName}' COMPLETED (duration ${state.scenarioDuration}s reached) at t=${currentTime.toFixed(1)}s`);
       this.emit('scenario_completed', stationId, state.scenarioName);
       return;
     }

     for (const iterBlock of state.scenarioBlocks) {
         const startTime = iterBlock.startTime;
         if (currentTime >= startTime && !iterBlock._applied) {
             // Skip ASYNCHRONY blocks — their patient params represent pre-asynchrony
             // baselines and would overwrite the values that injectAsynchrony() just set.
             if (iterBlock.type === 'ASYNCHRONY') {
                 iterBlock._applied = true;
                 continue;
             }
             if (iterBlock.parameterChanges && Object.keys(iterBlock.parameterChanges).length > 0) {
                 state.settings = {
                    ...state.settings,
                    ...iterBlock.parameterChanges
                 };
             }
             // Core patient parameters
             if (iterBlock.compliance !== undefined) {
                 state.patient.compliance = Math.max(1, iterBlock.compliance);
             }
             if (iterBlock.resistance !== undefined) {
                 state.patient.resistance = Math.max(0.5, iterBlock.resistance);
             }
             // ILSim patient parameters
             if (iterBlock.rin !== undefined) {
                 state.patient.rin = Math.max(0.1, iterBlock.rin);
             }
             if (iterBlock.rout !== undefined) {
                 state.patient.rout = Math.max(0.1, iterBlock.rout);
             }
             if (iterBlock.p01 !== undefined) {
                 state.patient.p01 = Math.max(0, iterBlock.p01);
             }
             if (iterBlock.Tcykl !== undefined) {
                 state.patient.Tcykl = Math.max(0.5, iterBlock.Tcykl);
             }
             if (iterBlock.PTi !== undefined) {
                 state.patient.PTi = Math.max(0, iterBlock.PTi);
             }
             if (iterBlock.PriorityPR !== undefined) {
                 state.patient.PriorityPR = Math.max(0, iterBlock.PriorityPR);
             }
             if (iterBlock.PressureRaiseT !== undefined) {
                 state.patient.PressureRaiseT = Math.max(0, iterBlock.PressureRaiseT);
             }
             if (iterBlock.DoubleTriggeringTime !== undefined) {
                 state.patient.DoubleTriggeringTime = Math.max(0, iterBlock.DoubleTriggeringTime);
             }
             if (iterBlock.knobDisable !== undefined) {
                 state.patient.knobDisable = iterBlock.knobDisable;
             }
             iterBlock._applied = true;
         }
     }
  }
}
