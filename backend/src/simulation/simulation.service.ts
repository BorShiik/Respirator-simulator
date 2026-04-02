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

  // Sampling rate
  private readonly SAMPLE_RATE = 50; // 50 Hz
  private readonly DT = 1 / this.SAMPLE_RATE; // 0.02 seconds

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
    if (state) {
      if (type !== null && state.asynchrony.type !== type) {
         state.asynchrony = { active: true, type };
         state.baselineSettings = { ...state.settings };
         state.currentAsynchronyEvent = null; // Manual injection
         // Notify for analytics logging
         this.emit('asynchrony_injected', stationId, type);
      } else if (type === null) {
         state.asynchrony = { active: false, type: null };
         state.baselineSettings = null;
         state.currentAsynchronyEvent = null;
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
        // Student fixed if they reduced trigger threshold by at least 1.0
        // OR reduced IPAP by at least 2.0 (reducing over-assistance)
        return (current.trigger <= base.trigger - 1.0 + 0.001) || (current.ipap <= base.ipap - 2 + 0.001);

      case 'DOUBLE_TRIGGER':
      case 'PREMATURE_CYCLING':
        // Student fixed if they lengthened inspiration time (Ti) by at least 0.2s
        return current.ti >= base.ti + 0.2 - 0.001;

      case 'FLOW_MISMATCH':
        // Fixed if they increased IPAP by 2 (augmenting flow/pressure support)
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

    // 2. Manage Phase Transitions
    this.managePhases(state);

    // 3. Calculate Physics (RC Model)
    this.calculatePhysics(state);

    // 4. Process Scheduled Scenario Events
    this.processScheduledEvents(stationId, state);

    // 4.5. Check if the user fixed the currently active asynchrony
    if (this.checkIfAsynchronyFixed(state)) {
       const resolvedType = state.asynchrony.type;
       state.asynchrony = { active: false, type: null };
       state.baselineSettings = null;
       if (state.currentAsynchronyEvent) {
          state.currentAsynchronyEvent._resolved = true;
          state.currentAsynchronyEvent = null;
       }
       this.emit('asynchrony_resolved', stationId, resolvedType);
    }

    // 5. Apply Asynchrony Effects
    this.applyAsynchrony(state);

    // 6. Send Telemetry (Batched)
    // Convert units for frontend:
    // Pressure: cmH2O (no conversion)
    // Flow: L/s -> L/min (x60)
    // Volume: L -> mL (x1000)
    
    // Add current points to batch buffers
    state.pressureBuffer.push(Math.round(state.currentPressure * 10) / 10);
    state.flowBuffer.push(Math.round(state.currentFlow * 60 * 10) / 10);
    state.volumeBuffer.push(Math.round(state.currentVolume * 1000));

    // Send payload every 5 ticks (100ms / 10Hz)
    if (state.pressureBuffer.length >= 5) {
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
    const breathPeriod = 60 / settings.rr; // seconds per machine breath

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
        let isFailedTrigger = false;

        // INEFFECTIVE_TRIGGER asynchrony logic
        if (state.asynchrony.active && state.asynchrony.type === 'INEFFECTIVE_TRIGGER') {
           if (state.breathCount % 3 === 2) {
              isFailedTrigger = true;
           }
        }

        if (isFailedTrigger) {
           // Machine "ignores" the trigger
           state.phaseTime = 0;
           state.breathCount++; 
        } else {
           state.phase = 'inspiration';
           state.phaseTime = 0;
           state.breathCount++;
           // We ONLY reset breathTime if it's a real breath start (for Pmus phase)
           // But actually in ILSim P0.1 drives Pmus independently of machine. 
           // However, for simplified synchronization, we might want to align them.
           // For now, let's keep breathTime advancing for the patient rate.
        }
      }
    }

    // Independent Patient Breathing Cycle (Pmus phase)
    const patientPeriod = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Infinity;
    if (state.breathTime >= patientPeriod) {
       state.breathTime = 0;
    }
  }

  /**
   * Calculate physics using 3-resistance numerical integration
   * Based on ILSimulator RespMathModel
   */
  private calculatePhysics(state: SimulationState): void {
    const { settings, patient } = state;
    
    // 1. Constants and parameters
    const R = patient.resistance; // Airway R
    const Rin = patient.rin;       // Inlet R
    const Rout = patient.rout;     // Outlet/Leak R
    const C = patient.compliance / 1000; // C in L/cmH2O
    
    const denominator = (1/R + 1/Rin + 1/Rout);

    // 2. Determine Machine Inlet Pressure (Pin)
    let Pin = state.phase === 'inspiration' ? settings.ipap : settings.epap;

    // Apply Rise Time (PressureRaiseT)
    if (state.phase === 'inspiration' && settings.pressureRaiseT > 0) {
      if (state.phaseTime < settings.pressureRaiseT) {
        const progress = state.phaseTime / settings.pressureRaiseT;
        Pin = settings.epap + (settings.ipap - settings.epap) * progress;
      }
    }

    // 3. Calculate Patient Muscle Effort (Pmus)
    const Pm = this.calculateMusclePressure(state);
    state.musclePressure = Pm;

    // 4. Numerical Integration Step
    // Up_next = Up + dUp * dt
    state.currentVolume = Math.max(0, state.currentVolume + state.dUp * this.DT);

    // 5. Calculate Alveolar Pressure (Pp)
    // Pp = (Up/(R*C) + Pin/Rin - Pm/R) / denominator
    const Pp = (state.currentVolume / (R * C) + Pin/Rin - Pm/R) / denominator;
    state.alveolarPressure = Pp;

    // 6. Calculate Flows
    const Iin = (Pin - Pp) / Rin;
    const Iout = Pp / Rout;

    // 7. Update Derivative for next step
    state.dUp = Iin - Iout;
    
    // Updates for Telemetry
    state.currentPressure = Pin; 
    state.currentFlow = Iin; // Flow visible to the machine
  }

  /**
   * Calculate Muscle Pressure (P_mus) using exponential model
   * Based on ILSimulator Pmus implementation
   */
  private calculateMusclePressure(state: SimulationState): number {
    const { effort, spontaneousRate, p01 } = state.patient;
    
    if (spontaneousRate <= 0 || effort <= 0 || p01 <= 0) return 0;

    const fv = spontaneousRate / 60; // frequency in Hz
    const PmusTime = 1 / fv; // total cycle time in seconds
    
    // Use effort to scale P01 (0-100% effort scales p01)
    const scaledP01 = p01 * (effort / 100);
    
    // Default TiLoc (physiological estimate)
    const TiLoc = (0.0125 * spontaneousRate + 0.125) * PmusTime;
    
    // Calculate Pmax for the exponential curve
    const Pmax = scaledP01 / (1 - Math.exp(-(0.1 * (spontaneousRate + 4 * scaledP01)) / 10));
    
    const timeInBreath = state.breathTime % PmusTime;
    let pmus = 0;

    if (timeInBreath <= TiLoc) {
      // Inspiration phase effort
      pmus = Pmax * (1 - Math.exp(-(spontaneousRate + 4 * scaledP01) / 10 * timeInBreath));
    } else {
      // Expiration phase decay
      pmus = Pmax * Math.exp(-(((spontaneousRate + (scaledP01 / 2)) / 10) * (timeInBreath - (TiLoc - 0.1))));
    }

    return -pmus; // Negative pressure represents inspiratory effort
  }

  private applyAsynchrony(state: SimulationState): void {
    if (!state.asynchrony.active) return;
    
    if (state.asynchrony.type === 'FLOW_MISMATCH') {
       if (state.phase === 'inspiration' && state.settings.mode.startsWith('VC')) {
          // Turbulence increases resistance reading
          state.currentPressure += 5 * Math.random();
       }
    }
    else if (state.asynchrony.type === 'INEFFECTIVE_TRIGGER') {
       // Visual representation of patient effort that ventilator ignored.
       // The breath was dropped (phase stayed 'expiration') 
       // When breathCount was incremented, previous '2' became '0' % 3.
       if (state.phase === 'expiration' && state.phaseTime < 0.25 && (state.breathCount % 3 === 0)) {
           const t = state.phaseTime / 0.25;
           const patientEffort = Math.sin(t * Math.PI) * 2.5; // Up to 2.5 cmH2O dip in circuit pressure
           
           state.currentPressure -= patientEffort;
           // Slight inward flow due to effort against closed expiratory valve bias flow
           state.currentFlow += patientEffort * 0.1; 
       }
    }
    else if (state.asynchrony.type === 'DOUBLE_TRIGGER') {
       // Patient wants more volume, immediately triggering a SECOND strong artificial breath 
       // during early expiration. This yields a second pressure peak.
       if (state.phase === 'expiration' && state.phaseTime < 0.4) {
           const t = state.phaseTime / 0.4;
           const peakPressure = (state.settings.pinsp || (state.settings.ipap - state.settings.peep));
           state.currentPressure += peakPressure * Math.sin(t * Math.PI) * 0.8;
           
           // Limit stacking volume to realistic TLC (ex. 1500ml total) to prevent infinite accumulation
           if (state.currentVolume < 1.5) {
               state.currentVolume += 0.02 * Math.sin(t * Math.PI); 
           }
           state.currentFlow += 0.5 * Math.sin(t * Math.PI); // Positive inspiratory flow
       }
    }
    else if (state.asynchrony.type === 'PREMATURE_CYCLING') {
       // Ventilator cycles to expiration BEFORE patient finishes inspiration.
       // Patient still pulls air, leading to positive flow despite expiration mode, and negative pressure.
       if (state.phase === 'expiration' && state.phaseTime < 0.3) {
           const t = state.phaseTime / 0.3;
           state.currentFlow += 0.8 * (1 - t);
           state.currentPressure -= 2 * (1 - t);
       }
    }
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
         state.asynchrony = { active: true, type: expectedAsynchronyType };
         state.baselineSettings = { ...state.settings };
         state.currentAsynchronyEvent = activeBlock;
         this.emit('asynchrony_injected', stationId, expectedAsynchronyType);
     } 
     // If no block should be active, but one IS active (and it's tied to a scheduled event)
     else if (!expectedAsynchronyType && state.asynchrony.active && state.currentAsynchronyEvent) {
         const expiredType = state.asynchrony.type;
         state.asynchrony = { active: false, type: null };
         state.baselineSettings = null;
         state.currentAsynchronyEvent = null;
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
