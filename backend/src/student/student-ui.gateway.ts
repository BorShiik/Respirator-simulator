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

interface ClientInfo {
  studentName: string;
  stationId: string | null;
  roomCode: string | null;
}

@WebSocketGateway({
  path: '/api/stations/ws', // Listen to the same path student-ui expects
})
export class StudentUiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StudentUiGateway.name);
  private activeClients: Set<WebSocket> = new Set();

  // Per-client student info
  private clientInfoMap: Map<WebSocket, ClientInfo> = new Map();

  // GPIO "active" student — the last-registered student gets hardware control
  private gpioActiveStudent: string | null = null;

  constructor(
    private readonly simulationService: SimulationService,
    private readonly linkService: StudentLinkService,
    private readonly gpioService: GpioService,
  ) {
    // Listen to hardware encoder events
    this.gpioService.on('encoder', (event) => {
        if (!this.gpioActiveStudent) return;
        const currentSimState = this.simulationService.getState(this.gpioActiveStudent);
        if (!currentSimState) return;

        const param = this.gpioService.getSelectedParameter();
        const config = (this.gpioService.getParameterConfig() as any)[param];
        if (config) {
            const currentValue = (currentSimState.settings as any)[param] || 0;
            const newValue = this.gpioService.calculateNewValue(currentValue, config, event.direction, event.clicks);
            
            const updatedSettings = { ...currentSimState.settings, [param]: newValue };
            if (param === 'ipap') updatedSettings.pinsp = newValue;
            if (param === 'epap') updatedSettings.peep = newValue;

            this.simulationService.updateSettings(this.gpioActiveStudent, updatedSettings as any);

            // Send back only to clients of this student
            this.broadcastToStudent(this.gpioActiveStudent, {
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
        // Send to all clients (parameter selection is global for GPIO)
        this.broadcastAll({
            type: 'parameterSelected',
            parameter: param
        });
    });

    this.simulationService.on('patient_updated', (stationId, patient) => {
        this.broadcastToStudent(stationId, {
            type: 'status',
            patientParams: patient
        });
    });

    // Listen to trainer commands forwarded by StudentLinkService
    this.linkService.on('trainer_continue', (_scenarioId, studentName) => {
        this.logger.log(`Trainer requested CONTINUE for ${studentName || 'active student'}`);
        const target = studentName || this.gpioActiveStudent;
        if (target) this.resumeSimulation(target);
    });

    this.linkService.on('trainer_pause', (studentName) => {
        this.logger.log(`Trainer requested PAUSE for ${studentName || 'active student'}`);
        const target = studentName || this.gpioActiveStudent;
        if (target) this.pauseSimulation(target);
    });

    this.linkService.on('trainer_reset', (studentName) => {
        this.logger.log(`Trainer requested RESET for ${studentName || 'active student'}`);
        const target = studentName || this.gpioActiveStudent;
        if (target) this.resetSimulation(target);
    });

    this.linkService.on('station_id_updated', (stationId: string, studentName: string) => {
        this.logger.log(`Confirmed Station ID from Trainer: ${stationId} for ${studentName}`);
        // Update stationId in all clients belonging to this student
        for (const [client, info] of this.clientInfoMap.entries()) {
            if (info.studentName === studentName) {
                info.stationId = stationId;
            }
        }
        this.broadcastToStudent(studentName, { 
            type: 'registered', 
            studentName: studentName, 
            stationId: stationId, 
            status: 'idle' 
        });
    });

    this.linkService.on('registration_error', (message: string) => {
        this.logger.warn(`Registration failed: ${message}`);
        // Send to all unregistered clients
        this.broadcastAll({ type: 'error', message });
    });

    // Forward trainer connection status to student UI
    this.linkService.on('trainer_connection_status', (connected: boolean) => {
        this.logger.log(`Trainer connection status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        this.broadcastAll({ type: 'trainerStatus', connected });
    });

    // Notify student UI when scenario completes
    this.simulationService.on('scenario_completed', (stationId: string, scenarioName: string) => {
        this.logger.log(`Scenario '${scenarioName}' completed — notifying student UI for ${stationId}`);
        this.broadcastToStudent(stationId, {
            type: 'status',
            status: 'scenario_completed',
            scenarioName,
        });
    });

    // Listen to settings update events from SimulationService
    this.simulationService.on('settings_updated', (stationId, settings) => {
        this.broadcastToStudent(stationId, {
            type: 'settingsUpdate',
            settings
        });
    });

    // Listen to trainer settings and scenario application events
    this.linkService.on('trainer_settings_applied', (studentName) => {
        const state = this.simulationService.getState(studentName);
        if (state) {
            this.broadcastToStudent(studentName, {
                type: 'status',
                status: this.simulationService.isSimulationRunning(studentName) ? 'running' : 'paused',
                scenarioName: state.scenarioName || 'Free Practice',
                difficulty: state.difficulty || 'EASY',
                patientParams: state.patient || null,
                settings: state.settings,
                asynchrony: state.asynchrony,
            });
        }
    });

    // Listen to asynchrony events
    this.simulationService.on('asynchrony_injected', (stationId, type) => {
        const state = this.simulationService.getState(stationId);
        this.broadcastToStudent(stationId, {
            type: 'status',
            asynchrony: state?.asynchrony || { active: true, type },
            patientParams: state?.patient || null,
        });
    });

    this.simulationService.on('asynchrony_resolved', (stationId, type) => {
        const state = this.simulationService.getState(stationId);
        this.broadcastToStudent(stationId, {
            type: 'status',
            asynchrony: state?.asynchrony || { active: false, type: null },
            patientParams: state?.patient || null,
        });
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

    const info = this.clientInfoMap.get(client);
    this.clientInfoMap.delete(client);

    if (info) {
      const studentName = info.studentName;

      // Check if any other clients are still connected for this student
      const otherClients = this.getClientsForStudent(studentName);

      if (otherClients.length === 0) {
        // Last client for this student — pause simulation and notify trainer
        this.logger.log(`No active clients left for ${studentName}, pausing simulation`);
        this.pauseSimulation(studentName);
        this.linkService.notifyLogout(studentName);

        // If this was the GPIO-active student, clear it
        if (this.gpioActiveStudent === studentName) {
          this.gpioActiveStudent = null;
          // Pick another student if there are any
          const remainingStudents = this.getActiveStudentNames();
          if (remainingStudents.length > 0) {
            this.gpioActiveStudent = remainingStudents[0];
          }
        }
      }
    }
  }

  private handleMessage(client: WebSocket, message: any) {
    const clientInfo = this.clientInfoMap.get(client);
    const studentName = clientInfo?.studentName;

    switch (message.type || message.event) {
      case 'register':
        const name = (message.data?.studentName || message.studentName)?.trim();
        const roomCode = (message.data?.roomCode || message.roomCode)?.trim();
        if (name) {
          this.registerStudent(client, name, roomCode);
        }
        break;

      case 'settingsUpdate':
        if (studentName && message.settings) {
          this.simulationService.updateSettings(studentName, message.settings);
        }
        break;

      case 'selectParameter':
        if (message.parameter) {
          this.gpioService.setSelectedParameter(message.parameter);
        }
        break;

      case 'start':
        if (studentName) this.startSimulation(studentName);
        break;

      case 'stop':
        if (studentName) this.stopSimulation(studentName);
        break;

      case 'pause':
        if (studentName) this.pauseSimulation(studentName);
        break;

      case 'continue':
        if (studentName) this.resumeSimulation(studentName);
        break;

      case 'reset':
        if (studentName) this.resetSimulation(studentName);
        break;
      
      case 'logout':
        this.clientInfoMap.delete(client);
        this.sendToClient(client, { type: 'loggedOut', status: 'idle' });

        // Only pause simulation and notify trainer if no other clients remain for this student
        if (studentName) {
          const remaining = this.getClientsForStudent(studentName);
          if (remaining.length === 0) {
            this.pauseSimulation(studentName);
            this.linkService.notifyLogout(studentName);
            if (this.gpioActiveStudent === studentName) {
              this.gpioActiveStudent = null;
              const others = this.getActiveStudentNames();
              if (others.length > 0) {
                this.gpioActiveStudent = others[0];
              }
            }
          }
        }
        break;

      case 'set_asynchrony':
        if (studentName && message.asynchronyType !== undefined) {
          this.simulationService.injectAsynchrony(studentName, message.asynchronyType);
        }
        break;
    }
  }

  public registerStudent(client: WebSocket, name: string, roomCode?: string) {
    // Store per-client info
    const info: ClientInfo = {
      studentName: name,
      stationId: null,
      roomCode: roomCode || null,
    };
    this.clientInfoMap.set(client, info);

    // Set GPIO active student to the most recently registered
    this.gpioActiveStudent = name;
    
    if (roomCode === 'LEARN') {
      info.stationId = 'LEARN';
      this.sendToClient(client, { type: 'registered', studentName: name, stationId: 'LEARN', status: 'idle' });
    } else {
      // Register upstream - Trainer will assign an ID and send it back
      this.linkService.registerWithMaster(name, roomCode);
    }

    // Check if simulation already exists for this student
    const existingState = this.simulationService.getState(name);
    if (existingState) {
       this.resumeSimulation(name);
    } else {
       this.startSimulation(name, roomCode === 'LEARN' ? 'Tryb Nauki' : 'Free Practice');
    }
  }

  public startSimulation(studentName: string, scenarioName: string = 'Free Practice') {
    if (!studentName) return;

    this.simulationService.startSimulation(studentName, scenarioName, (telemetry) => {
      // Send locally only to clients of this student
      this.broadcastToStudent(studentName, {
        type: 'telemetry',
        ...telemetry
      });
      // Send to master
      this.linkService.sendTelemetryToMaster(studentName, telemetry);
    });

    const state = this.simulationService.getState(studentName);
    this.broadcastToStudent(studentName, { 
      type: 'status', 
      status: 'running', 
      scenarioName, 
      difficulty: state?.difficulty || 'EASY',
      patientParams: state?.patient || null,
      settings: state?.settings || null,
      asynchrony: state?.asynchrony || null,
      studentName: studentName 
    });

    this.linkService.sendSimulationStatusToMaster(studentName, 'running');

    // Notify trainer to create/start a session for analytics
    this.linkService.notifySessionStart(studentName, scenarioName);
  }

  public stopSimulation(studentName: string) {
    if (!studentName) return;
    this.simulationService.stopSimulation(studentName);
    this.broadcastToStudent(studentName, { type: 'status', status: 'stopped' });

    // Notify trainer to complete the active session
    this.linkService.notifySessionStop(studentName);
  }

  public pauseSimulation(studentName: string) {
    if (!studentName) return;
    this.simulationService.pauseSimulation(studentName);
    const state = this.simulationService.getState(studentName);
    this.broadcastToStudent(studentName, { 
      type: 'status', 
      status: 'paused',
      scenarioName: state?.scenarioName || 'Free Practice',
      difficulty: state?.difficulty || 'EASY',
      patientParams: state?.patient || null,
      settings: state?.settings || null,
      asynchrony: state?.asynchrony || null,
    });
    this.linkService.sendSimulationStatusToMaster(studentName, 'paused');
  }

  public resumeSimulation(studentName: string) {
    if (!studentName) return;
    this.simulationService.resumeSimulation(studentName);
    const state = this.simulationService.getState(studentName);
    const scenarioName = state?.scenarioName;
    this.broadcastToStudent(studentName, { 
      type: 'status', 
      status: 'running', 
      scenarioName: scenarioName || 'Free Practice', 
      difficulty: state?.difficulty || 'EASY',
      patientParams: state?.patient || null,
      settings: state?.settings || null,
      asynchrony: state?.asynchrony || null,
      studentName: studentName 
    });
    this.linkService.sendSimulationStatusToMaster(studentName, 'running');
  }

  public resetSimulation(studentName: string) {
    if (!studentName) return;
    this.simulationService.resetSimulation(studentName);
    this.simulationService.resumeSimulation(studentName);
    const state2 = this.simulationService.getState(studentName);
    const scenarioName2 = state2?.scenarioName;
    this.broadcastToStudent(studentName, { 
      type: 'status', 
      status: 'reset', 
      scenarioName: scenarioName2 || 'Free Practice', 
      difficulty: state2?.difficulty || 'EASY',
      patientParams: state2?.patient || null,
      settings: state2?.settings || null,
      asynchrony: state2?.asynchrony || null,
      studentName: studentName 
    });
    this.linkService.sendSimulationStatusToMaster(studentName, 'running');
  }

  // ── Helpers ──────────────────────────────────────────

  /** Get all connected WebSocket clients for a given student name */
  private getClientsForStudent(studentName: string): WebSocket[] {
    const clients: WebSocket[] = [];
    for (const [client, info] of this.clientInfoMap.entries()) {
      if (info.studentName === studentName && client.readyState === WebSocket.OPEN) {
        clients.push(client);
      }
    }
    return clients;
  }

  /** Get all unique student names currently connected */
  private getActiveStudentNames(): string[] {
    const names = new Set<string>();
    for (const info of this.clientInfoMap.values()) {
      names.add(info.studentName);
    }
    return Array.from(names);
  }

  /** Get the stationId for a given student name (from any connected client) */
  public getStationIdForStudent(studentName: string): string | null {
    for (const info of this.clientInfoMap.values()) {
      if (info.studentName === studentName && info.stationId) {
        return info.stationId;
      }
    }
    return null;
  }

  private sendToClient(client: WebSocket, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  /** Send message only to clients registered as the given student */
  private broadcastToStudent(studentName: string, message: any) {
    const payload = JSON.stringify(message);
    for (const [client, info] of this.clientInfoMap.entries()) {
      if (info.studentName === studentName && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /** Send message to ALL connected clients (e.g. trainer status) */
  private broadcastAll(message: any) {
    const payload = JSON.stringify(message);
    this.activeClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}
