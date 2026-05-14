import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { SimulationService } from '../simulation/simulation.service';
import { StudentLinkService } from './student-link.service';
import { VentilatorSettings, DEFAULT_SETTINGS } from '../common/dto/ventilator.dto';
import { GpioService } from '../hardware/gpio.service';

@WebSocketGateway({
  path: '/api/stations/ws', // Listen to the same path student-ui expects
})
export class StudentUiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StudentUiGateway.name);
  private activeClients: Set<WebSocket> = new Set();
  private currentStudentName: string | null = null;
  private currentStationId: string | null = null;

  constructor(
    private readonly simulationService: SimulationService,
    private readonly linkService: StudentLinkService,
    private readonly gpioService: GpioService,
  ) {
    // Listen to hardware encoder events
    this.gpioService.on('encoder', (event) => {
        if (!this.currentStudentName) return;
        const currentSimState = this.simulationService.getState(this.currentStudentName);
        if (!currentSimState) return;

        const param = this.gpioService.getSelectedParameter();
        const config = (this.gpioService.getParameterConfig() as any)[param];
        if (config) {
            const currentValue = (currentSimState.settings as any)[param] || 0;
            const newValue = this.gpioService.calculateNewValue(currentValue, config, event.direction, event.clicks);
            
            const updatedSettings = { ...currentSimState.settings, [param]: newValue };
            if (param === 'ipap') updatedSettings.pinsp = newValue;
            if (param === 'epap') updatedSettings.peep = newValue;

            this.simulationService.updateSettings(this.currentStudentName, updatedSettings as any);

            // Send back to all UIs immediately
            this.broadcast({
                type: 'settingsUpdate',
                settings: updatedSettings
            });
        }
    });

    this.gpioService.on('button', (event) => {
        if (event.action === 'press') {
           this.gpioService.selectNextParameter();
        }
    });

    this.gpioService.on('parameterChanged', (param) => {
        this.broadcast({
            type: 'parameterSelected',
            parameter: param
        });
    });

    this.simulationService.on('patient_updated', (stationId, patient) => {
        if (stationId === this.currentStudentName) {
            this.broadcast({
                type: 'status',
                patientParams: patient
            });
        }
    });

    // Listen to trainer commands forwarded by StudentLinkService
    // This ensures start/stop/reset always use the unified callback
    // (which sends telemetry to both UI AND master)
    this.linkService.on('trainer_continue', () => {
        this.logger.log('Trainer requested CONTINUE');
        this.resumeSimulation();
    });

    this.linkService.on('trainer_pause', () => {
        this.logger.log('Trainer requested PAUSE');
        this.pauseSimulation();
    });

    this.linkService.on('trainer_reset', () => {
        this.logger.log('Trainer requested RESET');
        this.resetSimulation();
    });

    this.linkService.on('station_id_updated', (stationId: string) => {
        this.logger.log(`Confirmed Station ID from Trainer: ${stationId}`);
        this.currentStationId = stationId;
        this.broadcast({ type: 'registered', studentName: this.currentStudentName, stationId: this.currentStationId, status: 'idle' });
    });

    // Forward trainer connection status to student UI
    this.linkService.on('trainer_connection_status', (connected: boolean) => {
        this.logger.log(`Trainer connection status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        this.broadcast({ type: 'trainerStatus', connected });
    });
  }

  handleConnection(client: WebSocket) {
    this.logger.log('Local UI connected');
    this.activeClients.add(client);

    // Awaiting registration by default
    client.send(JSON.stringify({ type: 'connected', status: 'awaiting_registration' }));

    // Send current trainer connection status immediately
    client.send(JSON.stringify({ type: 'trainerStatus', connected: this.linkService.trainerConnected }));

    client.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(client, msg);
      } catch (e) {
        this.logger.error('Failed to parse UI message', e instanceof Error ? e.stack : e);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Local UI disconnected');
    this.activeClients.delete(client);

    // Only stop simulation if NO clients are connected anymore
    if (this.activeClients.size === 0 && this.currentStudentName) {
      this.logger.log(`No active clients left, pausing simulation for ${this.currentStudentName}`);
      this.pauseSimulation();
      this.linkService.notifyLogout();
      this.currentStudentName = null;
      this.currentStationId = null;
    }
  }

  private handleMessage(client: WebSocket, message: any) {
    switch (message.type || message.event) {
      case 'register':
        const name = (message.data?.studentName || message.studentName)?.trim();
        const roomCode = (message.data?.roomCode || message.roomCode)?.trim();
        if (name) {
          this.registerStudent(name, roomCode);
        }
        break;

      case 'settingsUpdate':
        if (this.currentStudentName && message.settings) {
          this.simulationService.updateSettings(this.currentStudentName, message.settings);
        }
        break;

      case 'selectParameter':
        if (message.parameter) {
          this.gpioService.setSelectedParameter(message.parameter);
        }
        break;

      case 'start':
        this.startSimulation();
        break;

      case 'stop':
        this.stopSimulation();
        break;

      case 'pause':
        this.pauseSimulation();
        break;

      case 'continue':
        this.resumeSimulation();
        break;

      case 'reset':
        this.resetSimulation();
        break;
      
      case 'logout':
        if (this.currentStudentName) {
           this.pauseSimulation();
           this.linkService.notifyLogout();
        }
        this.currentStudentName = null;
        this.currentStationId = null;
        this.broadcast({ type: 'loggedOut', status: 'idle' });
        break;
    }
  }

  public registerStudent(name: string, roomCode?: string) {
    this.currentStudentName = name;
    // We no longer generate a random station ID locally. 
    // We wait for the Trainer to assign an incrementing numeric ID.
    this.currentStationId = null; 
    
    this.broadcast({ type: 'registered', studentName: name, status: 'idle' });
    
    // Register upstream - Trainer will assign an ID and send it back
    this.linkService.registerWithMaster(name, roomCode);

    // Check if simulation already exists
    const existingState = this.simulationService.getState(name);
    if (existingState) {
       this.resumeSimulation();
    } else {
       this.startSimulation('Free Practice');
    }
  }

  public startSimulation(scenarioName: string = 'Free Practice') {
    if (!this.currentStudentName) return;
    const name = this.currentStudentName;

    this.simulationService.startSimulation(name, scenarioName, (telemetry) => {
      // Send locally to all UIs
      this.broadcast({
        type: 'telemetry',
        ...telemetry
      });
      // Send to master
      this.linkService.sendTelemetryToMaster(telemetry);
    });

    this.broadcast({ 
      type: 'status', 
      status: 'running', 
      scenarioName, 
      difficulty: this.simulationService.getState(name)?.difficulty || 'EASY',
      patientParams: this.simulationService.getState(name)?.patient || null,
      studentName: name 
    });

    this.linkService.sendSimulationStatusToMaster('running');

    // Notify trainer to create/start a session for analytics
    this.linkService.notifySessionStart(scenarioName);
  }

  public stopSimulation() {
    if (!this.currentStudentName) return;
    this.simulationService.stopSimulation(this.currentStudentName);
    this.broadcast({ type: 'status', status: 'stopped' });

    // Notify trainer to complete the active session
    this.linkService.notifySessionStop();
  }

  public pauseSimulation() {
    if (!this.currentStudentName) return;
    this.simulationService.pauseSimulation(this.currentStudentName);
    this.broadcast({ type: 'status', status: 'paused' });
    this.linkService.sendSimulationStatusToMaster('paused');
  }

  public resumeSimulation() {
    if (!this.currentStudentName) return;
    this.simulationService.resumeSimulation(this.currentStudentName);
    const state = this.simulationService.getState(this.currentStudentName);
    const scenarioName = state?.scenarioName;
    this.broadcast({ 
      type: 'status', 
      status: 'running', 
      scenarioName: scenarioName || 'Free Practice', 
      difficulty: state?.difficulty || 'EASY',
      patientParams: state?.patient || null,
      studentName: this.currentStudentName 
    });
    this.linkService.sendSimulationStatusToMaster('running');
  }

  public resetSimulation() {
    if (!this.currentStudentName) return;
    this.simulationService.resetSimulation(this.currentStudentName);
    this.simulationService.resumeSimulation(this.currentStudentName);
    const state2 = this.simulationService.getState(this.currentStudentName);
    const scenarioName2 = state2?.scenarioName;
    this.broadcast({ 
      type: 'status', 
      status: 'reset', 
      scenarioName: scenarioName2 || 'Free Practice', 
      difficulty: state2?.difficulty || 'EASY',
      patientParams: state2?.patient || null,
      studentName: this.currentStudentName 
    });
    this.linkService.sendSimulationStatusToMaster('running');
  }

  private broadcast(message: any) {
    const payload = JSON.stringify(message);
    this.activeClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}
