import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { StationsGateway } from '../stations/stations.gateway';
import { SimulationService } from '../simulation/simulation.service';

interface ExtendedWebSocket extends WebSocket {
  isTrainer?: boolean;
}

@WebSocketGateway({
  path: '/api/trainer/ws',
})
export class TrainerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private trainerClients: Set<ExtendedWebSocket> = new Set();
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly stationsGateway: StationsGateway,
    private readonly simulationService: SimulationService,
  ) {}

  handleConnection(client: ExtendedWebSocket) {
    console.log('Trainer connected');
    client.isTrainer = true;
    this.trainerClients.add(client);

    // Start broadcasting if not already
    if (!this.broadcastInterval) {
      this.startBroadcasting();
    }

    // Send initial student list
    this.sendStudentList(client);
  }

  handleDisconnect(client: ExtendedWebSocket) {
    console.log('Trainer disconnected');
    this.trainerClients.delete(client);

    // Stop broadcasting if no trainers connected
    if (this.trainerClients.size === 0 && this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private startBroadcasting() {
    // Broadcast student states every 500ms
    this.broadcastInterval = setInterval(() => {
      this.broadcastStudentStates();
    }, 500);
  }

  private sendStudentList(client: ExtendedWebSocket) {
    const students = this.getStudentList();
    this.sendToClient(client, { type: 'studentsSnapshot', students });
  }

  private broadcastStudentStates() {
    const studentNames = this.stationsGateway.getConnectedStudents();

    for (const studentName of studentNames) {
      const studentClient = this.stationsGateway.getStudentClient(studentName);
      const simState = this.simulationService.getState(studentName);

      if (studentClient && simState) {
        const studentData = {
          studentName,
          status: studentClient.isRunning ? 'running' : 'idle',
          scenarioName: simState.scenarioName,
          settings: simState.settings,
          asynchrony: simState.asynchrony,
          pressure: [simState.currentPressure],
          flow: [simState.currentFlow],
          volume: [simState.currentVolume],
          breathCount: simState.breathCount,
          lastUpdate: Date.now(),
        };

        this.broadcast({ type: 'studentUpdate', student: studentData });
      }
    }
  }

  private getStudentList() {
    const studentNames = this.stationsGateway.getConnectedStudents();
    return studentNames.map((studentName) => {
      const studentInfo = this.stationsGateway.getStudentInfo(studentName);
      const simState = this.simulationService.getState(studentName);
      return {
        studentName,
        isRegistered: studentInfo?.isRegistered || false,
        isRunning: studentInfo?.isRunning || false,
        status: studentInfo?.isRunning ? 'running' : 'idle',
        scenarioName: simState?.scenarioName || null,
        sessionId: studentInfo?.sessionId || null,
        scenarioId: studentInfo?.scenarioId || null,
        settings: simState?.settings || null,
        asynchrony: simState?.asynchrony || null,
        pressure: simState ? [simState.currentPressure] : [],
        lastUpdate: Date.now(),
      };
    });
  }

  private sendToClient(client: ExtendedWebSocket, data: any) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    for (const client of this.trainerClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  // Called when student list changes
  notifyStudentChange() {
    const students = this.getStudentList();
    this.broadcast({ type: 'studentsSnapshot', students });
  }
}
