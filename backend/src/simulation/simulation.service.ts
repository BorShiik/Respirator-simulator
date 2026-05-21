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

      // ─── ILSim scenario1.ts baseline: stiff lung (R=20, C=30), patient effort ────
      // All asynchrony types share this profile; specifics layer on top.
      state.patient.resistance = 20;
      state.patient.compliance = 30;
      state.patient.rin = 1;
      state.patient.rout = 20;
      state.patient.p01 = 2;
      state.patient.Tcykl = 2;
      state.patient.PTi = 0;
      state.patient.PriorityPR = 0;
      state.patient.PressureRaiseT = 0;
      state.patient.DoubleTriggeringTime = 0;
      state.settings.trigger = 2;

      switch (type) {
        case 'INEFFECTIVE_TRIGGER':
          // ILSim step 3: upTriggerPower=10 — trigger threshold too high to fire
          state.settings.trigger = 10;
          break;
        case 'AUTO_TRIGGER':
          // ILSim step 4: PriorityPR=30 — vent fires faster than patient breathes
          state.patient.PriorityPR = 30;
          break;
        case 'DELAYED_CYCLING':
          // ILSim step 5: PTi=0.6 — patient exhales early, vent keeps pushing
          state.patient.PTi = 0.6;
          break;
        case 'PREMATURE_CYCLING':
          // ILSim step 6: PTi=1.3 — patient inhales longer than vent cycles
          state.patient.PTi = 1.3;
          break;
        case 'DOUBLE_TRIGGER':
          // ILSim step 7: DoubleTriggeringTime=0.5, PTi=1
          state.patient.PTi = 1;
          state.patient.DoubleTriggeringTime = 0.5;
          break;
        case 'FLOW_MISMATCH':
          // ILSim step 8: PressureRaiseT=0.3, PTi=1 — slow pressure ramp vs demand
          state.patient.PTi = 1;
          state.patient.PressureRaiseT = 0.3;
          break;
        case 'REVERSE_TRIGGER':
          // Machine triggers first, patient effort follows mid-breath
          state.patient.PriorityPR = 0;
          state.patient.p01 = 5;
          state.patient.effort = 100;
          state.patient.PTi = 0.8;
          state.patient.Tcykl = 4.0;
          break;
      }

      this.emit('asynchrony_injected', stationId, type);
    } else if (type === null) {
      if (state.baselinePatient) {
        state.patient = { ...state.baselinePatient };
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
        // Backend forces trigger=15. Student needs to lower it below Pmax (~10) to detect effort
        return current.trigger <= 9.0 || current.ipap <= base.ipap - 2 + 0.001;
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

    // ─── 3. Determine Pin (machine inlet pressure) ───────────────────
    let Pin = actual_cycle_time >= state.settings.ti
      ? state.settings.epap
      : state.settings.ipap;

    // ─── 4. Patient breath cycle reset (ILSim breath flag) ───────────
    if (this.roundTo(
          this.roundTo(state.breathTime, 2) % this.roundTo(state.patient.Tcykl, 2),
        2) === 0) {
      state.breath = false;
    }

    // ─── 5. Calculate Pmus (muscle pressure) ─────────────────────────
    let Pm = 0;
    if (state.asynchrony.active && state.asynchrony.type === 'REVERSE_TRIGGER') {
      // Reverse triggering: patient effort starts shortly after machine inspiration
      // e.g. 0.3s after machine cycle starts
      const delay = 0.3;
      if (actual_cycle_time >= delay && actual_cycle_time < delay + state.patient.PTi) {
         const localBreathTime = actual_cycle_time - delay;
         Pm = this.calculateMusclePressure(
           state.patient.p01 * 1.5, // strong entrained effort
           localBreathTime,
           state.patient.Tcykl,
           state.patient.PTi,
           true
         );
      }
    } else if (this.roundTo(state.T, 2) >= this.roundTo(state.patient.Tcykl, 2)) {
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
      let new_actual_cycle_time = this.roundTo(state.time, 2);
      if (!isSpontaneousMode) {
         new_actual_cycle_time = new_actual_cycle_time % this.roundTo(state.T, 2);
      }
      Pin = new_actual_cycle_time >= state.settings.ti
        ? state.settings.epap
        : state.settings.ipap;
    }

    // ─── 7. PressureRaiseT — linear ramp (ILSim logic) ──────────────
    let actual_cycle_time2 = this.roundTo(state.time, 2);
    if (!isSpontaneousMode) {
       actual_cycle_time2 = actual_cycle_time2 % this.roundTo(state.T, 2);
    }
    
    if ((state.patient.PressureRaiseT > actual_cycle_time2 ||
         (!isSpontaneousMode && actual_cycle_time2 === this.roundTo(state.T, 2))) &&
        state.patient.PressureRaiseT !== 0) {
      let actual_raise_time = 0;
      if (actual_cycle_time2 !== this.roundTo(state.T, 2)) {
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

    let Pp = 0;
    
    // Check if Volume Control mode and in inspiration phase
    const isVC = state.settings.mode.startsWith('VC-');
    const isInspiration = actual_cycle_time < state.settings.ti;

    if (isVC && isInspiration) {
      // Volume Control: Machine forces a constant inspiratory flow
      const targetFlow = (state.settings.vt / 1000) / state.settings.ti; // L/s
      
      // Calculate resulting airway pressure (Pp) given forced Iin = targetFlow
      const denomVC = 1/R + 1/Rout;
      Pp = ( (state.currentVolume / C - Pm) / R + targetFlow ) / denomVC;
      
      const Iout = Pp / Rout;
      state.dUp = targetFlow - Iout; // Net flow into lungs
      state.currentVolume += state.dUp * this.DT;
      
      // Back-calculate Pin for consistency
      Pin = targetFlow * Rin + Pp;
    } else {
      // Pressure Control (PC-CMV, PSV, CPAP) or Expiration Phase
      state.currentVolume = state.currentVolume + state.dUp * this.DT;
      Pp = (state.currentVolume / (R * C) + Pin / Rin - Pm / R) / state.denominator;
      
      const Iout = Pp / Rout;
      const Iin = (Pin - Pp) / Rin;
      state.dUp = Iin - Iout;
    }
    
    state.alveolarPressure = Pp;

    // ─── 13. Advance time AFTER physics (ILSim order) ────────────────
    state.time += this.DT;
    state.breathTime += this.DT;
    state.totalTime = this.roundTo(state.totalTime + this.DT, 2);

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
           // Move next async block to 5 seconds from now (only if earlier than scheduled)
           const earlyStart = state.totalTime + 5;
           if (earlyStart < nextAsyncBlock.startTime) {
             console.log(`[SimulationService] Early resolution! Moving next async from ${nextAsyncBlock.startTime}s to ${earlyStart.toFixed(1)}s`);
             nextAsyncBlock.startTime = earlyStart;
           }
         } else {
           // All asynchronies resolved — schedule scenario completion in 5s
           state.scenarioCompletesAt = state.totalTime + 5;
           console.log(`[SimulationService] All asynchronies resolved! Scenario completes at ${state.scenarioCompletesAt.toFixed(1)}s`);
         }
       }
    }

    // ─── 17. Send telemetry ──────────────────────────────────────────
    // Pressure display: Pp + ventilator servo impedance correction.
    // Real ventilators can't maintain perfect pressure during sudden flow demand
    // from patient effort. This creates brief dips at the airway pressure sensor.
    // Modeled as: ΔPaw = Pm × (R_servo / R_airway), where R_servo ≈ 3 cmH₂O/(L/s).
    // With R_airway = 10: factor = 3/10 = 0.3.
    const R_SERVO_FACTOR = 0.3; // R_servo / R_airway
    const displayPressure = Pp - state.musclePressure * R_SERVO_FACTOR;
    state.pressureBuffer.push(Math.round(displayPressure * 10) / 10);
    // Flow: raw physics output — already includes Pm effects via Pp equation (line 580)
    state.flowBuffer.push(Math.round(state.dUp * 60 * 10) / 10);
    state.volumeBuffer.push(Math.round(state.currentVolume * 1000));

    if (state.pressureBuffer.length >= 5) {
      const telemetry: TelemetryData = {
        timestamp: Date.now(),
        pressure: [...state.pressureBuffer],
        flow: [...state.flowBuffer],
        volume: [...state.volumeBuffer],
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

     if (expectedAsynchronyType && state.asynchrony.type !== expectedAsynchronyType) {
         console.log(`[SimulationService] Scheduled asynchrony ${expectedAsynchronyType} activated at t=${currentTime.toFixed(1)}s for ${stationId}`);
         this.injectAsynchrony(stationId, expectedAsynchronyType);
         state.currentAsynchronyEvent = activeBlock;
     } else if (!expectedAsynchronyType && state.asynchrony.active && state.currentAsynchronyEvent) {
         const expiredType = state.asynchrony.type;
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
