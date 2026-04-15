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
  time: number;           // Current simulation time in seconds
  phase: 'inspiration' | 'expiration';
  phaseTime: number;      // Time within current phase in seconds
  breathCount: number;
  
  currentPressure: number; // Airway pressure Pin (cmH2O)
  currentFlow: number;     // Inlet Flow Iin (L/s)
  currentVolume: number;   // Integrated volume Up (L)
  musclePressure: number;  // Pmus (cmH2O)
  alveolarPressure: number; // Pp (cmH2O) - NEW
  dUp: number;             // Flow derivative (L/s^2) for numerical integration - NEW
  breathTime: number;      // Time since start of last breath (for Pmus) - NEW
  
  settings: VentilatorSettings;
  patient: PatientModel;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
  scenarioBlocks?: any[];
  
  // Asynchrony resolution tracking
  baselineSettings: VentilatorSettings | null;
  baselinePatient: PatientModel | null;
  currentAsynchronyEvent: any | null;
  
  // Telemetry Buffers for batching (10Hz)
  pressureBuffer: number[];
  flowBuffer: number[];
  volumeBuffer: number[];
}

@Injectable()
export class SimulationService extends EventEmitter {
  private states: Map<string, SimulationState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (data: TelemetryData) => void> = new Map();

  // Sampling rate — ILSim uses h=0.1 (10 Hz). Physics is calibrated for this step.
  private readonly SAMPLE_RATE = 10; // 10 Hz
  private readonly DT = 0.1; // 0.1 seconds (ILSim h)

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

    const state: SimulationState = {
      time: 0,
      phase: 'inspiration',
      phaseTime: 0,
      breathCount: 0,
      currentPressure: DEFAULT_SETTINGS.peep,
      currentFlow: 0,
      currentVolume: 0,
      musclePressure: 0,
      alveolarPressure: DEFAULT_SETTINGS.peep,
      dUp: 0,
      breathTime: 0,
      settings: { ...DEFAULT_SETTINGS },
      patient: { ...DEFAULT_PATIENT },
      asynchrony: { active: false, type: null },
      scenarioName,
      scenarioBlocks: preservedBlocks,
      baselineSettings: null,
      baselinePatient: null,
      currentAsynchronyEvent: null,
      pressureBuffer: [],
      flowBuffer: [],
      volumeBuffer: [],
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

    // Sanitize and update
    if (parameters.resistance !== undefined) {
      state.patient.resistance = Math.max(0.5, parameters.resistance);
    }

    if (parameters.compliance !== undefined) {
      // Store as mL/cmH2O (DTO units). Physics converts to L/cmH2O via /1000.
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
        // Reset timers so that relative timestamps (e.g. at 30s) trigger properly!
        state.time = 0;
        state.phaseTime = 0;
        state.breathCount = 0;
        state.phase = 'expiration';
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
      // Save baseline before modifying patient parameters
      state.asynchrony = { active: true, type };
      state.baselineSettings = { ...state.settings };
      state.baselinePatient = { ...state.patient };
      state.currentAsynchronyEvent = null;

      // Change patient physics parameters to produce the asynchrony naturally
      switch (type) {
        case 'INEFFECTIVE_TRIGGER':
          // Trigger threshold too high — machine ignores patient effort
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 2.5;
          state.settings.trigger = 10;
          break;
        case 'AUTO_TRIGGER':
          // Machine breathes at its own rate, ignoring patient
          state.patient.PriorityPR = 30;
          break;
        case 'DELAYED_CYCLING':
          // Short patient Ti — machine still delivers pressure after patient stops
          state.patient.PTi = 0.6;
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 3.0;
          break;
        case 'PREMATURE_CYCLING':
          // Long patient Ti — machine cuts off before patient finishes
          state.patient.PTi = 1.3;
          state.patient.p01 = 3;
          state.patient.effort = 100;
          state.patient.Tcykl = 3.0;
          break;
        case 'DOUBLE_TRIGGER':
          // Pin drops to EPAP mid-breath, causing second trigger
          state.patient.DoubleTriggeringTime = 0.5;
          break;
        case 'FLOW_MISMATCH':
          // Slow pressure rise — flow cannot match patient demand
          state.patient.PressureRaiseT = 0.3;
          break;
        case 'REVERSE_TRIGGER':
          // Not implemented in ILSim either — placeholder
          break;
      }

      this.emit('asynchrony_injected', stationId, type);
    } else if (type === null) {
      // Restore original patient parameters
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
        // Student reduces trigger sensitivity or reduces IPAP
        return current.trigger <= base.trigger - 1.0 + 0.001 ||
               current.ipap <= base.ipap - 2 + 0.001;

      case 'AUTO_TRIGGER':
        // Student increases trigger threshold (less sensitive)
        return current.trigger >= base.trigger + 1.0 - 0.001;

      case 'DELAYED_CYCLING':
        // Student shortens Ti (machine stops earlier, matching patient)
        return current.ti <= base.ti - 0.2 + 0.001;

      case 'PREMATURE_CYCLING':
        // Student lengthens Ti (machine delivers longer, matching patient)
        return current.ti >= base.ti + 0.2 - 0.001;

      case 'DOUBLE_TRIGGER':
        // Student lengthens Ti (one long breath instead of two short ones)
        return current.ti >= base.ti + 0.2 - 0.001;

      case 'FLOW_MISMATCH':
        // Student increases IPAP (more pressure = more flow)
        return current.ipap >= base.ipap + 2 - 0.001;

      default:
        return false;
    }
  }

  /**
   * Main simulation tick
   */
  private simulationTick(stationId: string): void {
    const state = this.states.get(stationId);
    const callback = this.callbacks.get(stationId);
    if (!state || !callback) return;

    // 1. Advance Time
    state.time += this.DT;
    state.phaseTime += this.DT;
    state.breathTime += this.DT;

    // 2. Manage Phase Transitions
    this.managePhases(state);

    // 3. Calculate Physics (RC Model)
    this.calculatePhysics(state);

    // 4. Process Scheduled Scenario Events
    this.processScheduledEvents(stationId, state);

    // 4.5. Check if the user fixed the currently active asynchrony
    if (this.checkIfAsynchronyFixed(state)) {
       const resolvedType = state.asynchrony.type;
       // Restore original patient parameters
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

    // 5. Send Telemetry (Batched)
    // Convert units for frontend:
    // Pressure: cmH2O (no conversion)
    // Flow: L/s -> L/min (x60)
    // Volume: L -> mL (x1000)
    
    // Add current points to batch buffers
    state.pressureBuffer.push(Math.round(state.currentPressure * 10) / 10);
    state.flowBuffer.push(Math.round(state.currentFlow * 60 * 10) / 10);
    state.volumeBuffer.push(Math.round(state.currentVolume * 1000));

    // Send payload every tick at 10Hz (100ms)
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

      // Clear batch buffers
      state.pressureBuffer = [];
      state.flowBuffer = [];
      state.volumeBuffer = [];
    }
  }

  /**
   * Manage breath phases (Inspiration <-> Expiration)
   */
  private managePhases(state: SimulationState): void {
    const { settings, patient } = state;
    // PriorityPR overrides machine RR (auto-triggering)
    const breathPeriod = patient.PriorityPR !== 0
      ? 60 / patient.PriorityPR
      : 60 / settings.rr;

    // Machine Cycle logic
    if (state.phase === 'inspiration') {
      if (state.phaseTime >= settings.ti) {
        state.phase = 'expiration';
        state.phaseTime = 0;
      }
    } else {
      // Expiration -> Check for machine trigger or patient trigger
      const machineExpiratoryTime = breathPeriod - settings.ti;
      const isMachineTrigger = state.phaseTime >= machineExpiratoryTime;

      // Patient Trigger logic (from ILSimulator)
      // Check if muscle effort (negative Pmus) exceeds trigger threshold
      const isPatientTrigger = Math.abs(state.musclePressure) > settings.trigger && state.breathTime > 0.1;

      if (isMachineTrigger || isPatientTrigger) {
        state.phase = 'inspiration';
        state.phaseTime = 0;
        state.breathCount++;
        // Reset volume at start of new breath cycle (like ILSim startNewCycle)
        state.currentVolume = 0;
        state.dUp = 0;
      }
    }

    // Independent Patient Breathing Cycle — uses Tcykl (ILSim convention)
    // breathTime wraps around Tcykl via modulo in calculateMusclePressure
    // No explicit reset needed — Pmus uses breathTime % Tcykl
  }

  /**
   * Calculate physics using 3-resistance numerical integration
   * Based on ILSimulator RespMathModel
   */
  private calculatePhysics(state: SimulationState): void {
    const { settings, patient } = state;

    // 1. Constants and parameters
    const R = patient.resistance;
    const Rin = patient.rin;
    const Rout = patient.rout;
    const C = patient.compliance / 1000; // C in L/cmH2O

    const denominator = (1/R + 1/Rin + 1/Rout);

    // Breath period — PriorityPR overrides RR (auto-triggering)
    const breathPeriod = patient.PriorityPR !== 0
      ? this.roundTo(60 / patient.PriorityPR, 1)
      : this.roundTo(60 / settings.rr, 1);

    // actual_cycle_time — time within current machine breath cycle
    const actual_cycle_time = this.roundTo(
      this.roundTo(state.time, 1) % breathPeriod, 1
    );

    // 2. Determine Machine Inlet Pressure (Pin)
    let Pin = actual_cycle_time >= settings.ti ? settings.epap : settings.ipap;

    // PressureRaiseT — linear ramp from EPAP to IPAP (ILSim logic)
    if (patient.PressureRaiseT > 0 &&
        (patient.PressureRaiseT > actual_cycle_time || actual_cycle_time === breathPeriod)) {
      let actual_raise_time = 0;
      if (actual_cycle_time !== breathPeriod) {
        actual_raise_time = actual_cycle_time;
      }
      const raising_force = (settings.ipap - settings.epap) * this.DT / patient.PressureRaiseT;
      Pin = settings.epap + raising_force * actual_raise_time * (1 / this.DT);
    }

    // DoubleTriggeringTime — Pin drops to EPAP mid-breath (double trigger)
    if (patient.DoubleTriggeringTime !== 0 &&
        actual_cycle_time === patient.DoubleTriggeringTime) {
      Pin = settings.epap;
    }

    // 3. Calculate Patient Muscle Effort (Pmus)
    const Pm = this.calculateMusclePressure(state);
    state.musclePressure = Pm;

    // 4. Numerical Integration Step (no Math.max — ILSim allows negative volume)
    state.currentVolume = state.currentVolume + state.dUp * this.DT;

    // 5. Calculate Alveolar Pressure (Pp)
    const Pp = (state.currentVolume / (R * C) + Pin/Rin - Pm/R) / denominator;
    state.alveolarPressure = Pp;

    // 6. Calculate Flows
    const Iin = (Pin - Pp) / Rin;
    const Iout = Pp / Rout;

    // 7. Update Derivative for next step
    state.dUp = Iin - Iout;

    // Updates for Telemetry — display Pp (alveolar) and dUp (net flow), like ILSim
    state.currentPressure = Pp;
    state.currentFlow = state.dUp;
  }

  /**
   * Calculate Muscle Pressure (P_mus) using exponential model
   * Rewritten to match ILSim Pmus() exactly.
   * Returns POSITIVE value (ILSim convention). The main equation subtracts Pm/R.
   */
  private calculateMusclePressure(state: SimulationState): number {
    const { effort, p01, Tcykl, PTi } = state.patient;

    // Scale P01 by effort (0-100%). effort=100 gives full p01.
    const scaledP01 = effort > 0 ? p01 * (effort / 100) : p01;

    if (scaledP01 === 0) return 0;

    const PmusTime = Tcykl; // patient respiratory cycle period (seconds)
    const fv = 60 / PmusTime; // breaths/min (ILSim: fv = 60/Tcykl)

    // Patient inspiratory time — use PTi if set, otherwise physiological estimate
    const TiLoc = PTi !== 0 ? PTi : (0.0125 * fv + 0.125) * PmusTime;

    // Pmax — peak muscle pressure
    const Pmax = scaledP01 / (1 - Math.exp(-(0.1 * (fv + 4 * scaledP01)) / 10));

    // Time within patient breathing cycle
    const time = this.roundTo(state.breathTime % PmusTime, 1);
    let lung = 0;

    if (time <= TiLoc) {
      // Inspiration: rising exponential
      lung = Pmax * (1 - Math.exp(-(fv + 4 * scaledP01) / 10 * time));
    } else {
      // Expiration: decaying exponential
      lung = Pmax * Math.exp(-((fv + scaledP01 / 2) / 10) * (time - (TiLoc - 0.1)));
    }

    // Add noise (+/- 2% of Pmax) like ILSim
    lung += this.addNoise(Pmax, 2);

    return lung; // Positive value — subtracted in main equation as -Pm/R
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

     const currentTime = state.time;
     
     // Determine what the state SHOULD be right now based on scenario blocks
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
                 break; // Found the active block, no need to check others for this tick
             }
         }
     }

     // If we found a block that should be active, but it's not currently active
     if (expectedAsynchronyType && state.asynchrony.type !== expectedAsynchronyType) {
         this.injectAsynchrony(stationId, expectedAsynchronyType);
         state.currentAsynchronyEvent = activeBlock;
     }
     // If no block should be active, but one IS active (and it's tied to a scheduled event)
     else if (!expectedAsynchronyType && state.asynchrony.active && state.currentAsynchronyEvent) {
         const expiredType = state.asynchrony.type;
         this.injectAsynchrony(stationId, null);
         this.emit('asynchrony_resolved', stationId, expiredType);
     }

     for (const iterBlock of state.scenarioBlocks) {
         
         const startTime = iterBlock.startTime;
         if (currentTime >= startTime && !iterBlock._applied) {
             // Apply Ventilator Settings changes
             if (iterBlock.parameterChanges && Object.keys(iterBlock.parameterChanges).length > 0) {
                 state.settings = {
                    ...state.settings,
                    ...iterBlock.parameterChanges
                 };
             }
             
             // Apply Patient Physics changes (Compliance, Resistance, etc.)
             if (iterBlock.compliance !== undefined) {
                 state.patient.compliance = Math.max(1, iterBlock.compliance);
             }
             if (iterBlock.resistance !== undefined) {
                 state.patient.resistance = Math.max(0.5, iterBlock.resistance);
             }
             
             iterBlock._applied = true;
         }
     }
  }
}
