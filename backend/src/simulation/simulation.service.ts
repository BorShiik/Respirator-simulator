import { Injectable } from '@nestjs/common';
import {
  VentilatorSettings,
  PatientModel,
  AsynchronyStatus,
  AsynchronyType,
  TelemetryData,
  DEFAULT_SETTINGS,
  DEFAULT_PATIENT,
} from '../common/dto';

interface SimulationState {
  time: number;           // Current simulation time in ms
  phase: 'inspiration' | 'expiration';
  phaseTime: number;      // Time within current phase
  breathCount: number;
  currentPressure: number;
  currentFlow: number;
  currentVolume: number;
  settings: VentilatorSettings;
  patient: PatientModel;
  asynchrony: AsynchronyStatus;
  scenarioName: string;
}

@Injectable()
export class SimulationService {
  private states: Map<string, SimulationState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (data: TelemetryData) => void> = new Map();

  // Sampling rate (samples per second)
  private readonly SAMPLE_RATE = 50; // 50 Hz
  private readonly SAMPLE_INTERVAL = 1000 / this.SAMPLE_RATE; // 20ms

  /**
   * Start simulation for a station
   */
  startSimulation(
    stationId: string,
    scenarioName: string,
    onTelemetry: (data: TelemetryData) => void,
  ): void {
    // Stop existing simulation if any
    this.stopSimulation(stationId);

    // Initialize state
    const state: SimulationState = {
      time: 0,
      phase: 'inspiration',
      phaseTime: 0,
      breathCount: 0,
      currentPressure: DEFAULT_SETTINGS.peep,
      currentFlow: 0,
      currentVolume: 0,
      settings: { ...DEFAULT_SETTINGS },
      patient: { ...DEFAULT_PATIENT },
      asynchrony: { active: false, type: null },
      scenarioName,
    };

    this.states.set(stationId, state);
    this.callbacks.set(stationId, onTelemetry);

    // Start the simulation loop
    const interval = setInterval(() => {
      this.simulationTick(stationId);
    }, this.SAMPLE_INTERVAL);

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
    if (state) {
      state.settings = { ...state.settings, ...settings };
    }
  }

  /**
   * Inject asynchrony (called by scenario)
   */
  injectAsynchrony(stationId: string, type: AsynchronyType | null): void {
    const state = this.states.get(stationId);
    if (state) {
      state.asynchrony = {
        active: type !== null,
        type,
      };
    }
  }

  /**
   * Get current state
   */
  getState(stationId: string): SimulationState | undefined {
    return this.states.get(stationId);
  }

  /**
   * Main simulation tick - generates waveforms
   */
  private simulationTick(stationId: string): void {
    const state = this.states.get(stationId);
    const callback = this.callbacks.get(stationId);
    if (!state || !callback) return;

    const { settings, patient } = state;
    const breathPeriod = 60000 / settings.rr; // ms per breath
    const inspiratoryTime = settings.ti * 1000; // ms
    const expiratoryTime = breathPeriod - inspiratoryTime;

    // Pressure/flow/volume accumulators for this packet
    const pressureSamples: number[] = [];
    const flowSamples: number[] = [];
    const volumeSamples: number[] = [];

    // Generate samples for this tick
    for (let i = 0; i < 1; i++) {
      // Update phase timing
      state.phaseTime += this.SAMPLE_INTERVAL;
      state.time += this.SAMPLE_INTERVAL;

      // Check for phase transition
      if (state.phase === 'inspiration' && state.phaseTime >= inspiratoryTime) {
        state.phase = 'expiration';
        state.phaseTime = 0;
      } else if (state.phase === 'expiration' && state.phaseTime >= expiratoryTime) {
        state.phase = 'inspiration';
        state.phaseTime = 0;
        state.breathCount++;
        state.currentVolume = 0; // Reset volume at start of breath
      }

      // Calculate waveforms based on mode and phase
      this.calculateWaveforms(state, settings, patient);

      // Apply asynchrony effects
      this.applyAsynchrony(state);

      pressureSamples.push(Math.round(state.currentPressure * 10) / 10);
      flowSamples.push(Math.round(state.currentFlow * 10) / 10);
      volumeSamples.push(Math.round(state.currentVolume));
    }

    // Send telemetry
    const telemetry: TelemetryData = {
      timestamp: Date.now(),
      pressure: pressureSamples,
      flow: flowSamples,
      volume: volumeSamples,
      settings: state.settings,
      asynchrony: state.asynchrony,
      scenarioName: state.scenarioName,
    };

    callback(telemetry);
  }

  /**
   * Calculate pressure, flow, volume based on ventilator mode
   */
  private calculateWaveforms(
    state: SimulationState,
    settings: VentilatorSettings,
    patient: PatientModel,
  ): void {
    const { compliance, resistance } = patient;
    const timeConstant = (compliance * resistance) / 1000; // seconds

    if (state.phase === 'inspiration') {
      // Inspiration phase
      const targetPressure = settings.pinsp + settings.peep;
      const phaseProgress = state.phaseTime / (settings.ti * 1000);

      switch (settings.mode) {
        case 'PC-CMV':
        case 'PC-SIMV':
          // Pressure-controlled: pressure rises quickly, flow decays
          state.currentPressure = settings.peep + 
            (targetPressure - settings.peep) * (1 - Math.exp(-phaseProgress * 3));
          
          // Flow = (Pressure - PEEP) / Resistance, decaying exponentially
          const pressureDiff = state.currentPressure - settings.peep;
          state.currentFlow = (pressureDiff / resistance) * 60 * 
            Math.exp(-state.phaseTime / (timeConstant * 1000));
          break;

        case 'VC-CMV':
        case 'VC-SIMV':
          // Volume-controlled: constant flow, pressure rises
          const targetFlow = (settings.vt / settings.ti) / 1000 * 60; // L/min
          state.currentFlow = targetFlow;
          state.currentPressure = settings.peep + 
            (state.currentFlow / 60 * resistance) + 
            (state.currentVolume / compliance);
          break;

        case 'PSV':
          // Pressure support: similar to PC but flow-triggered
          state.currentPressure = settings.peep + settings.pinsp;
          state.currentFlow = ((settings.pinsp) / resistance) * 60 * 
            Math.exp(-state.phaseTime / (timeConstant * 1000));
          break;

        case 'CPAP':
          // Continuous positive pressure
          state.currentPressure = settings.peep;
          state.currentFlow = patient.effort * 0.5; // Patient-driven
          break;
      }

      // Integrate volume
      state.currentVolume += (state.currentFlow / 60) * this.SAMPLE_INTERVAL;

    } else {
      // Expiration phase
      const phaseProgress = state.phaseTime / (60000 / settings.rr - settings.ti * 1000);

      // Pressure decays to PEEP
      const excessPressure = state.currentPressure - settings.peep;
      state.currentPressure = settings.peep + 
        excessPressure * Math.exp(-phaseProgress * 4);

      // Flow is negative (exhalation), decays exponentially
      const peakExpFlow = -(state.currentVolume / (timeConstant * 1000)) * 60;
      state.currentFlow = peakExpFlow * Math.exp(-state.phaseTime / (timeConstant * 1000));

      // Volume decreases
      state.currentVolume += (state.currentFlow / 60) * this.SAMPLE_INTERVAL;
      if (state.currentVolume < 0) state.currentVolume = 0;
    }

    // Clamp values
    state.currentPressure = Math.max(0, state.currentPressure);
    state.currentFlow = Math.max(-100, Math.min(100, state.currentFlow));
  }

  /**
   * Apply asynchrony effects to the waveforms
   */
  private applyAsynchrony(state: SimulationState): void {
    if (!state.asynchrony.active) return;

    switch (state.asynchrony.type) {
      case 'INEFFECTIVE_TRIGGER':
        // Patient effort doesn't trigger breath - add small pressure dip
        if (state.phase === 'expiration' && Math.random() < 0.1) {
          state.currentPressure -= 2 + Math.random() * 2;
        }
        break;

      case 'DOUBLE_TRIGGER':
        // Two breaths in quick succession
        if (state.phase === 'expiration' && state.phaseTime < 200 && Math.random() < 0.3) {
          state.currentFlow = Math.abs(state.currentFlow) * 0.5;
        }
        break;

      case 'AUTO_TRIGGER':
        // Ventilator triggers without patient effort
        if (state.phase === 'expiration' && Math.random() < 0.05) {
          state.phase = 'inspiration';
          state.phaseTime = 0;
        }
        break;

      case 'DELAYED_CYCLING':
        // Inspiration continues too long
        // Effectively handled by extending Ti in the phase logic
        break;

      case 'PREMATURE_CYCLING':
        // Inspiration ends too early
        if (state.phase === 'inspiration' && state.phaseTime > state.settings.ti * 500) {
          if (Math.random() < 0.2) {
            state.phase = 'expiration';
            state.phaseTime = 0;
          }
        }
        break;

      case 'FLOW_MISMATCH':
        // Flow doesn't match patient demand
        state.currentFlow *= 0.7 + Math.random() * 0.3;
        break;

      case 'REVERSE_TRIGGER':
        // Ventilator triggers patient effort
        if (state.phase === 'inspiration' && state.phaseTime < 100) {
          state.currentPressure += 3;
        }
        break;
    }
  }
}
