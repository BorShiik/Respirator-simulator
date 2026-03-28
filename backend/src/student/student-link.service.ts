import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { SimulationService } from '../simulation/simulation.service';
import { TelemetryData } from '../common/dto/ventilator.dto';

@Injectable()
export class StudentLinkService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | null = null;
  private readonly logger = new Logger(StudentLinkService.name);
  private trainerUrl = process.env.TRAINER_URL || 'ws://localhost:8081/api/trainer/ws';
  private reconnectTimer: NodeJS.Timeout;
  
  public currentStudentName: string | null = null;

  constructor(private readonly simulationService: SimulationService) {}

  onModuleInit() {
    this.connect();

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
  }

  onModuleDestroy() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
    }
  }

  private connect() {
    this.logger.log(`Connecting to Master (Trainer) at ${this.trainerUrl}...`);
    this.ws = new WebSocket(this.trainerUrl);

    this.ws.on('open', () => {
      this.logger.log('Connected to Master Pi');
      // If student is already logged in locally, send registration upstream
      if (this.currentStudentName) {
        this.registerWithMaster(this.currentStudentName);
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      this.logger.warn('Disconnected from Master Pi, retrying in 5s...');
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      this.logger.error(`WebSocket Error: ${err.message}`);
    });
  }

  private handleMessage(rawData: string) {
    try {
      const msg = JSON.parse(rawData);
      if (!this.currentStudentName) return;

      switch (msg.type) {
        case 'set_asynchrony':
          this.simulationService.injectAsynchrony(this.currentStudentName, msg.asynchronyType);
          break;
        case 'update_patient':
          this.simulationService.updatePatientParameters(this.currentStudentName, msg.parameters);
          break;
        case 'trainer_command':
          if (msg.command === 'stop') {
             this.simulationService.stopSimulation(this.currentStudentName);
          } else if (msg.command === 'update_settings') {
             if (msg.settings) {
                this.simulationService.updateSettings(this.currentStudentName, msg.settings);
             }
             if (msg.scenario) {
                const state = this.simulationService.getState(this.currentStudentName);
                if (state) {
                   state.scenarioName = msg.scenario.name;
                   this.simulationService.applyScenarioEvents(this.currentStudentName, msg.scenario.events);
                }
             }
          } else if (msg.command === 'reset') {
             // Reset logic...
          }
          break;
      }
    } catch (e) {
      this.logger.error('Failed to parse trainer message', e);
    }
  }

  public registerWithMaster(studentName: string) {
    this.currentStudentName = studentName;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ 
        type: 'remote_student_register', 
        studentName 
      }));
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
}
