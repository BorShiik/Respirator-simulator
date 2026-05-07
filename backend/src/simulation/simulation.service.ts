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
  scenarioBlocks?: any[];

  // Asynchrony resolution tracking
  baselineSettings: VentilatorSettings | null;
  baselinePatient: PatientModel | null;
  currentAsynchronyEvent: any | null;

  // Telemetry Buffers
  pressureBuffer: number[];
  flowBuffer: number[];
  volumeBuffer: number[];

  // NIV / VEXP (ILSim metrics)
  NIV: number;
  VEXP: number;
}

@Injectable()
export class SimulationService extends EventEmitter {
  private states: Map<string, SimulationState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (data: TelemetryData) => void> = new Map();

  // Sampling rate — ILSim uses h=0.1 (10 Hz)
  private readonly SAMPLE_RATE = 10;
  private readonly DT = 0.1;

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
    const T = this.roundTo(60 / settings.rr, 1);

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
      breathTime: 0.1, // ILSim initializes breathTime to 0.1
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
      scenarioBlocks: preservedBlocks,
      baselineSettings: null,
      baselinePatient: null,
      currentAsynchronyEvent: null,
      pressureBuffer: [],
      flowBuffer: [],
      volumeBuffer: [],
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
    state.pressureBuffer = [];
    state.flowBuffer = [];
    state.volumeBuffer = [];

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
  }

  /**
   * Apply scenario events scheduled timeline
   */
  applyScenarioEvents(stationId: string, blocks: any[]): void {
     const state = this.states.get(stationId);
     if (state) {
        state.scenarioBlocks = [...blocks];
        state.time = 0;
        state.totalTime = 0;
        state.breathTime = 0.1;
        state.breathCount = 0;
        state.breath = false;
     }
  }

  /**
   * Get current state
   */
  getState(stationId: string): SimulationState | undefined {
    return this.states.get(stationId);
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

      switch (type) {
        case 'INEFFECTIVE_TRIGGER':
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 2.5;
          state.settings.trigger = 10;
          break;
        case 'AUTO_TRIGGER':
          state.patient.PriorityPR = 30;
          break;
        case 'DELAYED_CYCLING':
          state.patient.PTi = 0.6;
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 3.0;
          break;
        case 'PREMATURE_CYCLING':
          state.patient.PTi = 1.3;
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 3.0;
          break;
        case 'DOUBLE_TRIGGER':
          state.patient.DoubleTriggeringTime = 0.5;
          break;
        case 'FLOW_MISMATCH':
          state.patient.PressureRaiseT = 0.3;
          break;
        case 'REVERSE_TRIGGER':
          break;
      }

      this.emit('asynchrony_injected', stationId, type);
    } else if (type === null) {
      if (state.baselinePatient) {
        state.patient = { ...state.baselinePatient };
      }
      if (state.baselineSettings) {
        state.settings = { ...state.baselineSettings };
      }
      state.asynchrony = { active: false, type: null };
      state.baselineSettings = null;
      state.baselinePatient = null;
      state.currentAsynchronyEvent = null;
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
        return current.trigger <= base.trigger - 1.0 + 0.001 ||
               current.ipap <= base.ipap - 2 + 0.001;
      case 'AUTO_TRIGGER':
        return current.trigger >= base.trigger + 1.0 - 0.001;
      case 'DELAYED_CYCLING':
        return current.ti <= base.ti - 0.2 + 0.001;
      case 'PREMATURE_CYCLING':
        return current.ti >= base.ti + 0.2 - 0.001;
      case 'DOUBLE_TRIGGER':
        return current.ti >= base.ti + 0.2 - 0.001;
      case 'FLOW_MISMATCH':
        return current.ipap >= base.ipap + 2 - 0.001;
      default:
        return false;
    }
  }

  // ─── ILSim-equivalent: leakingBreathCPAPSTInit ─────────────────────
  private leakingBreathCPAPSTInit(state: SimulationState, breathReset: boolean = true): void {
    state.breath = false;
    state.time = 0;

    if (breathReset) {
      state.breathTime = 0.1;
    }

    // Recalculate physics constants from current parameters
    const R = state.patient.resistance;
    const Rin = state.patient.rin;
    const Rout = state.patient.rout;
    const C = state.patient.compliance / 1000;

    state.denominator = (1/R + 1/Rin + 1/Rout);

    // Calculate T
    if (state.patient.PriorityPR !== 0) {
      state.T = this.roundTo(60 / state.patient.PriorityPR, 1);
    } else {
      state.T = this.roundTo(60 / state.settings.rr, 1);
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
      state.T = this.roundTo(60 / state.patient.PriorityPR, 1);
    } else {
      state.T = this.roundTo(60 / state.settings.rr, 1);
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

    // ─── 1. Check for new cycle start (ILSim: time % T == 0) ────────
    if (this.roundTo(state.time, 1) % this.roundTo(state.T, 1) === 0.0) {
      this.startNewCycle(state, false);
    }

    // ─── 2. Calculate actual_cycle_time ──────────────────────────────
    const actual_cycle_time = this.roundTo(state.time, 1) % this.roundTo(state.T, 1);

    // ─── 3. Determine Pin (machine inlet pressure) ───────────────────
    let Pin = actual_cycle_time >= state.settings.ti
      ? state.settings.epap
      : state.settings.ipap;

    // ─── 4. Patient breath cycle reset (ILSim breath flag) ───────────
    if (this.roundTo(
          this.roundTo(state.breathTime, 1) % this.roundTo(state.patient.Tcykl, 1),
        1) === 0) {
      state.breath = false;
    }

    // ─── 5. Calculate Pmus (muscle pressure) ─────────────────────────
    let Pm = 0;
    if (this.roundTo(state.T, 1) >= this.roundTo(state.patient.Tcykl, 1)) {
      Pm = this.calculateMusclePressure(
        state.patient.p01,
        state.breathTime,
        state.patient.Tcykl,
        state.patient.PTi,
        true,
      );
    }
    state.musclePressure = Pm;

    // ─── 6. Patient trigger (ILSim logic) ────────────────────────────
    if (Math.abs(Pm) > state.settings.trigger && !state.breath) {
      this.startNewCycle(state, false);
      state.breath = true;

      // Recalculate Pin after cycle reset
      const new_actual_cycle_time = this.roundTo(state.time, 1) % this.roundTo(state.T, 1);
      Pin = new_actual_cycle_time >= state.settings.ti
        ? state.settings.epap
        : state.settings.ipap;
    }

    // ─── 7. PressureRaiseT — linear ramp (ILSim logic) ──────────────
    const actual_cycle_time2 = this.roundTo(state.time, 1) % this.roundTo(state.T, 1);
    if ((state.patient.PressureRaiseT > actual_cycle_time2 ||
         actual_cycle_time2 === this.roundTo(state.T, 1)) &&
        state.patient.PressureRaiseT !== 0) {
      let actual_raise_time = 0;
      if (actual_cycle_time2 !== this.roundTo(state.T, 1)) {
        actual_raise_time = actual_cycle_time2;
      }
      Pin = state.settings.epap + state.raisingForce * actual_raise_time * (1 / this.DT);
    }

    // ─── 8. DoubleTriggeringTime — Pin drops to EPAP ─────────────────
    if (actual_cycle_time2 === state.patient.DoubleTriggeringTime &&
        state.patient.DoubleTriggeringTime !== 0) {
      Pin = state.settings.epap;
    }

    // ─── 9. Physics: Volume integration ──────────────────────────────
    const R = state.patient.resistance;
    const Rin = state.patient.rin;
    const Rout = state.patient.rout;
    const C = state.patient.compliance / 1000;

    state.currentVolume = state.currentVolume + state.dUp * this.DT;

    // ─── 10. Alveolar Pressure (Pp) ──────────────────────────────────
    const Pp = (state.currentVolume / (R * C) + Pin / Rin - Pm / R) / state.denominator;
    state.alveolarPressure = Pp;

    // ─── 11. Flows ───────────────────────────────────────────────────
    const Iout = Pp / Rout;
    const Iin = (Pin - Pp) / Rin;

    // ─── 12. Update dUp for next step ────────────────────────────────
    state.dUp = Iin - Iout;

    // ─── 13. Advance time AFTER physics (ILSim order) ────────────────
    state.time += this.DT;
    state.breathTime += this.DT;
    state.totalTime = this.roundTo(state.totalTime + this.DT, 1);

    // ─── 14. Update telemetry values ─────────────────────────────────
    state.currentPressure = Pp;
    state.currentFlow = state.dUp;

    // ─── 15. Process scheduled scenario events ───────────────────────
    this.processScheduledEvents(stationId, state);

    // ─── 16. Check if student fixed the asynchrony ───────────────────
    if (this.checkIfAsynchronyFixed(state)) {
       const resolvedType = state.asynchrony.type;
       if (state.baselinePatient) {
         state.patient = { ...state.baselinePatient };
       }
       state.asynchrony = { active: false, type: null };
       state.baselineSettings = null;
       state.baselinePatient = null;
       if (state.currentAsynchronyEvent) {
          state.currentAsynchronyEvent._resolved = true;
          state.currentAsynchronyEvent = null;
       }
       this.emit('asynchrony_resolved', stationId, resolvedType);
    }

    // ─── 17. Send telemetry ──────────────────────────────────────────
    state.pressureBuffer.push(Math.round(Pp * 10) / 10);
    state.flowBuffer.push(Math.round(state.dUp * 60 * 10) / 10);
    state.volumeBuffer.push(Math.round(state.currentVolume * 1000));

    if (state.pressureBuffer.length >= 1) {
      const telemetry: TelemetryData = {
        timestamp: Date.now(),
        pressure: [...state.pressureBuffer],
        flow: [...state.flowBuffer],
        volume: [...state.volumeBuffer],
        settings: state.settings,
        asynchrony: state.asynchrony,
        scenarioName: state.scenarioName,
      };

      callback(telemetry);

      state.pressureBuffer = [];
      state.flowBuffer = [];
      state.volumeBuffer = [];
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

    const t = this.roundTo(time % PmusTime, 1);
    let lung = 0;

    if (t <= TiLoc) {
      lung = Pmax * (1 - Math.exp(-(fv + 4 * P01) / 10 * t));
    } else {
      lung = Pmax * Math.exp(-((fv + P01 / 2) / 10) * (t - (TiLoc - 0.1)));
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

     if (expectedAsynchronyType && state.asynchrony.type !== expectedAsynchronyType) {
         this.injectAsynchrony(stationId, expectedAsynchronyType);
         state.currentAsynchronyEvent = activeBlock;
     } else if (!expectedAsynchronyType && state.asynchrony.active && state.currentAsynchronyEvent) {
         const expiredType = state.asynchrony.type;
         this.injectAsynchrony(stationId, null);
         this.emit('asynchrony_resolved', stationId, expiredType);
     }

     for (const iterBlock of state.scenarioBlocks) {
         const startTime = iterBlock.startTime;
         if (currentTime >= startTime && !iterBlock._applied) {
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
