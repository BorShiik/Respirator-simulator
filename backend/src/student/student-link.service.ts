import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import * as dgram from 'dgram';
import { SimulationService } from '../simulation/simulation.service';
import { TelemetryData } from '../common/dto/ventilator.dto';
import { EventEmitter } from 'events';

const DISCOVERY_PORT = 41234;

@Injectable()
export class StudentLinkService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | null = null;
  private readonly logger = new Logger(StudentLinkService.name);
  private trainerUrl: string | null = process.env.TRAINER_URL || null;
  private reconnectTimer: NodeJS.Timeout;
  private discoverySocket: dgram.Socket | null = null;
  private isDiscovering = false;
  private isConnected = false;
  
  public currentStudentName: string | null = null;

  constructor(private readonly simulationService: SimulationService) {
    super();
  }

  onModuleInit() {
    // Subscribe to simulation events for analytics forwarding
    this.simulationService.on('setting_changed', (stationId, param, prev, curr, wasAsync, asyncType) => {
       if (stationId === this.currentStudentName && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
             type: 'student_event',
             studentName: this.currentStudentName,
             event: 'setting_change',
             parameter: param,
             previousValue: prev,
             newValue: curr,
             wasAsynchronyActive: wasAsync,
             asynchronyType: asyncType
           }));
        }
    });

    this.simulationService.on('asynchrony_injected', (stationId, type) => {
       if (stationId === this.currentStudentName && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
             type: 'student_event',
             studentName: this.currentStudentName,
             event: 'asynchrony_injected',
             asynchronyType: type
          }));
       }
    });

    this.simulationService.on('asynchrony_resolved', (stationId, type) => {
       if (stationId === this.currentStudentName && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
             type: 'student_event',
             studentName: this.currentStudentName,
             event: 'asynchrony_resolved',
             asynchronyType: type
          }));
       }
    });

    // If TRAINER_URL is explicitly set, connect directly
    // Otherwise, auto-discover trainer via UDP beacon
    if (this.trainerUrl) {
      this.logger.log(`TRAINER_URL is set: ${this.trainerUrl}`);
      this.connect();
    } else {
      this.logger.log('No TRAINER_URL set — starting auto-discovery...');
      this.startDiscovery();
    }
  }

  onModuleDestroy() {
    clearTimeout(this.reconnectTimer);
    this.stopDiscovery();
    if (this.ws) {
      this.ws.close();
    }
  }

  // ──────────────────────────────────────────────
  //  UDP Discovery
  // ──────────────────────────────────────────────

  private startDiscovery() {
    if (this.isDiscovering) return;
    this.isDiscovering = true;

    this.discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.discoverySocket.on('message', (msg, rinfo) => {
      try {
        const beacon = JSON.parse(msg.toString());
        if (beacon.type === 'trainer_beacon' && beacon.wsUrl) {
          this.logger.log(`🔍 Discovered trainer at ${beacon.wsUrl} (${beacon.trainerName || rinfo.address})`);
          
          // Save the discovered URL and connect
          this.trainerUrl = beacon.wsUrl;
          this.stopDiscovery();
          this.connect();
        }
      } catch (e) {
        // Ignore non-JSON or irrelevant UDP packets
      }
    });

    this.discoverySocket.on('error', (err) => {
      this.logger.error(`Discovery socket error: ${err.message}`);
      this.isDiscovering = false;
    });

    this.discoverySocket.bind(DISCOVERY_PORT, () => {
      this.logger.log(`👂 Listening for trainer beacons on UDP port ${DISCOVERY_PORT}...`);
    });
  }

  private stopDiscovery() {
    if (this.discoverySocket) {
      try {
        this.discoverySocket.close();
      } catch (e) {
        // Socket might already be closed
      }
      this.discoverySocket = null;
    }
    this.isDiscovering = false;
  }

  // ──────────────────────────────────────────────
  //  WebSocket Connection to Trainer
  // ──────────────────────────────────────────────

  private connect() {
    if (!this.trainerUrl) {
      this.logger.warn('No trainer URL available, falling back to discovery');
      this.startDiscovery();
      return;
    }

    this.logger.log(`Connecting to Trainer at ${this.trainerUrl}...`);
    this.ws = new WebSocket(this.trainerUrl);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.logger.log('✅ Connected to Trainer');
      if (this.currentStudentName) {
        this.registerWithMaster(this.currentStudentName);
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.ws = null;
      
      if (process.env.TRAINER_URL) {
        // Manual URL set: just reconnect on a timer
        this.logger.warn('Disconnected from Trainer, retrying in 5s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      } else {
        // Auto-discovered: re-discover in case trainer IP changed
        this.logger.warn('Disconnected from Trainer, restarting discovery...');
        this.trainerUrl = null;
        this.reconnectTimer = setTimeout(() => this.startDiscovery(), 3000);
      }
    });

    this.ws.on('error', (err) => {
      this.logger.error(`WebSocket Error: ${err.message}`);
    });
  }

  // ──────────────────────────────────────────────
  //  Message Handling
  // ──────────────────────────────────────────────

  private handleMessage(rawData: string) {
    try {
      const msg = JSON.parse(rawData);
      
      if (msg.type === 'registration_success') {
          this.logger.log(`Successfully registered as ${msg.studentName} on Trainer`);
          return;
      }

      if (!this.currentStudentName) {
          this.logger.warn('Received message from Trainer but no student name is set locally');
          return;
      }

      switch (msg.type) {
        case 'set_asynchrony':
          this.simulationService.injectAsynchrony(this.currentStudentName, msg.asynchronyType);
          break;
        case 'update_patient':
          this.simulationService.updatePatientParameters(this.currentStudentName, msg.parameters);
          break;
        case 'trainer_command':
          // Emit events instead of calling SimulationService directly
          // StudentUiGateway subscribes to these and uses the unified callback
          if (msg.command === 'stop') {
             this.logger.log('Trainer command: stop');
             this.emit('trainer_stop');
          } else if (msg.command === 'start') {
             this.logger.log('Trainer command: start');
             this.emit('trainer_start', msg.scenarioId);
          } else if (msg.command === 'update_settings') {
             if (msg.settings) {
                this.simulationService.updateSettings(this.currentStudentName, msg.settings);
             }
             if (msg.scenario) {
                const state = this.simulationService.getState(this.currentStudentName);
                if (state) {
                   state.scenarioName = msg.scenario.name;
                   this.simulationService.applyScenarioEvents(this.currentStudentName, msg.scenario.blocks || []);
                }
             }
          } else if (msg.command === 'reset') {
             this.logger.log('Trainer command: reset');
             this.emit('trainer_reset');
          }
          break;
      }
    } catch (e) {
      this.logger.error('Failed to parse trainer message', e);
    }
  }

  // ──────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────

  public registerWithMaster(studentName: string) {
    this.currentStudentName = studentName;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.logger.log(`Registering student "${studentName}" with Trainer...`);
      this.ws.send(JSON.stringify({ 
        type: 'remote_student_register', 
        studentName 
      }));
    } else {
      this.logger.warn('Cannot register with Trainer: WebSocket not open. Will register on connect.');
    }
  }

  public sendTelemetryToMaster(telemetry: TelemetryData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentStudentName) {
      this.ws.send(JSON.stringify({
        type: 'remote_student_telemetry',
        studentName: this.currentStudentName,
        telemetry
      }));
    }
  }

  /**
   * Notify the trainer that the student has started a simulation.
   * The trainer will create/start a session for analytics tracking.
   */
  public notifySessionStart(scenarioName: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentStudentName) {
      this.logger.log(`Notifying trainer: session started (${scenarioName})`);
      this.ws.send(JSON.stringify({
        type: 'student_session_start',
        studentName: this.currentStudentName,
        scenarioName,
      }));
    }
  }

  /**
   * Notify the trainer that the student has stopped or completed a simulation.
   * The trainer will complete the active session.
   */
  public notifySessionStop() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentStudentName) {
      this.logger.log('Notifying trainer: session stopped');
      this.ws.send(JSON.stringify({
        type: 'student_session_stop',
        studentName: this.currentStudentName,
      }));
    }
  }
}
