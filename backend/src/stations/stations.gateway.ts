import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { SimulationService } from '../simulation/simulation.service';
import { SessionsService } from '../sessions/sessions.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { VentilatorSettings, DEFAULT_SETTINGS } from '../common/dto';

interface ExtendedWebSocket extends WebSocket {
  clientId?: string;           // Internal unique ID (UUID)
  studentName?: string;        // Student's full name (primary identifier)
  sessionId?: string | null;
  scenarioId?: string | null;
  isRunning?: boolean;
  isRegistered?: boolean;      // Whether student has registered with name
}

@WebSocketGateway({
  path: '/api/stations/ws',
})
export class StationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map by studentName for easy lookup
  private clients: Map<string, ExtendedWebSocket> = new Map();
  // Map by clientId for internal tracking
  private clientsById: Map<string, ExtendedWebSocket> = new Map();

  constructor(
    private readonly simulationService: SimulationService,
    private readonly sessionsService: SessionsService,
    private readonly scenariosService: ScenariosService,
  ) {}

  handleConnection(client: ExtendedWebSocket, request: any) {
    try {
      // Generate unique client ID
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      client.clientId = clientId;
      client.studentName = undefined;
      client.sessionId = null;
      client.scenarioId = null;
      client.isRunning = false;
      client.isRegistered = false;

      this.clientsById.set(clientId, client);
      console.log(`Client connected: ${clientId} (awaiting registration)`);

      // Send initial state - waiting for registration
      this.sendToClient(client, { type: 'connected', status: 'awaiting_registration' });

      // Set up message handler for raw WebSocket messages
      (client as any).on('message', (data: Buffer | string) => {
        this.handleRawMessage(client, data.toString());
      });

      // Do NOT auto-start simulation - wait for registration

    } catch (error) {
      console.error('Error in handleConnection:', error);
    }
  }

  handleDisconnect(client: ExtendedWebSocket) {
    const studentName = client.studentName;
    const clientId = client.clientId;
    
    if (studentName) {
      console.log(`Student disconnected: ${studentName}`);
      this.simulationService.stopSimulation(studentName);
      this.clients.delete(studentName);
    }
    
    if (clientId) {
      this.clientsById.delete(clientId);
    }
  }

  private handleRawMessage(client: ExtendedWebSocket, rawData: string) {
    try {
      const message = JSON.parse(rawData);
      
      switch (message.type || message.event) {
        case 'register':
          this.handleRegister(client, message.data || message);
          break;
        case 'logout':
          this.handleLogout(client);
          break;
        case 'start':
          this.handleStart(client, message.data || message);
          break;
        case 'stop':
          this.handleStop(client);
          break;
        case 'reset':
          this.handleReset(client);
          break;
        case 'settingsUpdate':
          this.handleSettingsUpdate(client, message.settings || message.data);
          break;
        default:
          console.log('Unknown message type:', message.type || message.event);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Handle student registration with name
   */
  private handleRegister(client: ExtendedWebSocket, data: { studentName?: string }) {
    const studentName = data?.studentName?.trim();
    
    if (!studentName) {
      this.sendToClient(client, { 
        type: 'error', 
        message: 'Imię i nazwisko są wymagane' 
      });
      return;
    }

    // Check if student with this name is already connected
    if (this.clients.has(studentName) && this.clients.get(studentName) !== client) {
      this.sendToClient(client, { 
        type: 'error', 
        message: 'Student o tym imieniu jest już zalogowany' 
      });
      return;
    }

    // If client was previously registered with different name, clean up
    if (client.studentName && client.studentName !== studentName) {
      this.simulationService.stopSimulation(client.studentName);
      this.clients.delete(client.studentName);
    }

    client.studentName = studentName;
    client.isRegistered = true;
    this.clients.set(studentName, client);

    console.log(`Student registered: ${studentName}`);

    this.sendToClient(client, { 
      type: 'registered', 
      studentName,
      status: 'idle'
    });

    // Auto-start simulation after registration (Free Practice mode)
    this.startSimulationForClient(client);
  }

  /**
   * Handle student logout
   */
  private async handleLogout(client: ExtendedWebSocket) {
    const studentName = client.studentName;
    
    if (!studentName) {
      this.sendToClient(client, { type: 'error', message: 'Nie jesteś zalogowany' });
      return;
    }

    // Stop simulation and complete session
    await this.handleStop(client);

    // Clean up
    this.simulationService.stopSimulation(studentName);
    this.clients.delete(studentName);
    
    client.studentName = undefined;
    client.isRegistered = false;

    console.log(`Student logged out: ${studentName}`);

    this.sendToClient(client, { 
      type: 'loggedOut', 
      status: 'awaiting_registration' 
    });
  }

  private async startSimulationForClient(client: ExtendedWebSocket, scenarioId?: string) {
    const studentName = client.studentName;
    if (!studentName || !client.isRegistered) {
      this.sendToClient(client, { type: 'error', message: 'Musisz się najpierw zarejestrować' });
      return;
    }

    // Stop any existing simulation
    this.simulationService.stopSimulation(studentName);

    let scenarioName = 'Free Practice';
    let activeScenario: Awaited<ReturnType<typeof this.scenariosService.findById>> = null;

    if (scenarioId) {
      activeScenario = await this.scenariosService.findById(scenarioId);
      if (activeScenario) {
        scenarioName = activeScenario.name;
        client.scenarioId = scenarioId;
      }
    }

    const scenarioForCallback = activeScenario;

    // Create session with studentName
    const session = await this.sessionsService.create({
      stationId: studentName, // Use studentName as stationId for backward compatibility
      studentName,
      scenarioId,
      scenarioName,
      initialSettings: DEFAULT_SETTINGS,
    });
    await this.sessionsService.start(session.id);
    client.sessionId = session.id;
    client.isRunning = true;

    // Start simulation using studentName as identifier
    this.simulationService.startSimulation(studentName, scenarioName, (telemetry) => {
      // Send telemetry in the format frontend expects (flat, not nested)
      this.sendToClient(client, {
        type: 'telemetry',
        timestamp: telemetry.timestamp,
        pressure: telemetry.pressure,
        flow: telemetry.flow,
        volume: telemetry.volume,
        settings: telemetry.settings,
        asynchrony: telemetry.asynchrony,
        scenarioName: telemetry.scenarioName,
      });
      
      // Handle scenario events
      if (scenarioForCallback) {
        const simState = this.simulationService.getState(studentName);
        if (simState) {
          const timeSeconds = simState.time / 1000;
          const activeAsynchrony = this.scenariosService.getActiveAsynchrony(scenarioForCallback, timeSeconds);
          this.simulationService.injectAsynchrony(studentName, activeAsynchrony);
        }
      }
    });

    this.sendToClient(client, { type: 'status', status: 'running', scenarioName, studentName });
    console.log(`Simulation started for student: ${studentName}`);
  }

  async handleStart(client: ExtendedWebSocket, data: { scenarioId?: string }) {
    if (!client.isRegistered) {
      this.sendToClient(client, { type: 'error', message: 'Musisz się najpierw zarejestrować' });
      return;
    }
    await this.startSimulationForClient(client, data?.scenarioId);
  }

  async handleStop(client: ExtendedWebSocket) {
    const studentName = client.studentName;
    if (!studentName) return;

    this.simulationService.stopSimulation(studentName);

    if (client.sessionId) {
      const simState = this.simulationService.getState(studentName);
      await this.sessionsService.complete(
        client.sessionId,
        simState?.settings || DEFAULT_SETTINGS,
      );
    }

    client.isRunning = false;
    client.sessionId = null;

    this.sendToClient(client, { type: 'status', status: 'stopped' });
    console.log(`Simulation stopped for student: ${studentName}`);
  }

  handleReset(client: ExtendedWebSocket) {
    const studentName = client.studentName;
    if (!studentName) return;

    this.simulationService.updateSettings(studentName, DEFAULT_SETTINGS);
    this.sendToClient(client, { type: 'settingsUpdate', settings: DEFAULT_SETTINGS });
  }

  async handleSettingsUpdate(client: ExtendedWebSocket, settings: Partial<VentilatorSettings>) {
    const studentName = client.studentName;
    if (!studentName || !settings) return;

    const currentState = this.simulationService.getState(studentName);

    // Log the change if session is active
    if (client.sessionId && currentState) {
      for (const [param, newValue] of Object.entries(settings)) {
        const oldValue = (currentState.settings as any)[param];
        if (oldValue !== undefined && oldValue !== newValue) {
          await this.sessionsService.logSettingChange(
            client.sessionId,
            param,
            oldValue,
            newValue as number,
            currentState.asynchrony.active,
            currentState.asynchrony.type || undefined,
          );
        }
      }
    }

    this.simulationService.updateSettings(studentName, settings);
    this.sendToClient(client, { type: 'settingsUpdate', settings });
  }

  private sendToClient(client: ExtendedWebSocket, data: any) {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error sending to client:', error);
    }
  }

  // Public methods for trainer control
  getConnectedStudents(): string[] {
    return Array.from(this.clients.keys());
  }

  getStudentClient(studentName: string): ExtendedWebSocket | undefined {
    return this.clients.get(studentName);
  }

  getStudentInfo(studentName: string): { 
    studentName: string; 
    isRegistered: boolean;
    isRunning: boolean;
    sessionId: string | null;
    scenarioId: string | null;
  } | undefined {
    const client = this.clients.get(studentName);
    if (!client) return undefined;
    
    return {
      studentName: client.studentName || '',
      isRegistered: client.isRegistered || false,
      isRunning: client.isRunning || false,
      sessionId: client.sessionId || null,
      scenarioId: client.scenarioId || null,
    };
  }

  async commandStudent(studentName: string, command: 'start' | 'stop' | 'reset', scenarioId?: string) {
    const client = this.clients.get(studentName);
    if (!client) return false;

    switch (command) {
      case 'start':
        await this.handleStart(client, { scenarioId });
        break;
      case 'stop':
        await this.handleStop(client);
        break;
      case 'reset':
        this.handleReset(client);
        break;
    }
    return true;
  }
}
