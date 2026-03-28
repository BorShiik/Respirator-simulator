import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import * as WebSocketLib from 'ws';
import { SessionsService } from '../sessions/sessions.service';

// In the new architecture, TrainerGateway handles both Trainer UI clients 
// AND incoming data from remote Student Pi's.

interface ExtendedWebSocket extends WebSocket {
  isTrainer?: boolean;
  isRemoteStudent?: boolean;
  studentName?: string;
  on: (event: string, listener: (data: Buffer | string) => void) => void;
  send: (data: string | Buffer) => void;
  readyState: number;
}

@WebSocketGateway({
  path: '/api/trainer/ws', // Trainer UI and Remote students both connect here for now
})
export class TrainerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private trainerClients: Set<ExtendedWebSocket> = new Set();
  private studentClients: Map<string, ExtendedWebSocket> = new Map();
  
  // Cache of latest student states received via telemetry
  private studentStates: Map<string, any> = new Map();
  
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor(private readonly sessionsService: SessionsService) {}

  handleConnection(client: ExtendedWebSocket) {
    console.log('Client connected to Trainer Gateway');

    client.on('message', (data: Buffer | string) => {
      this.handleMessage(client, data.toString());
    });
  }

  handleDisconnect(client: ExtendedWebSocket) {
    if (client.isTrainer) {
      console.log('Trainer disconnected');
      this.trainerClients.delete(client);
    }

    if (client.isRemoteStudent && client.studentName) {
      console.log(`Remote Student disconnected: ${client.studentName}`);
      this.studentClients.delete(client.studentName);
      // Mark as disconnected in state but keep last known state maybe?
      const state = this.studentStates.get(client.studentName);
      if (state) {
        state.status = 'offline';
        this.notifyStudentChange();
      }
    }

    // Stop broadcasting if no trainers connected
    if (this.trainerClients.size === 0 && this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private handleMessage(client: ExtendedWebSocket, rawData: string) {
    try {
      const msg = JSON.parse(rawData);

      // 1. Differentiate Client Type
      if (msg.type === 'trainer_register') {
         client.isTrainer = true;
         this.trainerClients.add(client);
         if (!this.broadcastInterval) this.startBroadcasting();
         this.sendStudentList(client);
         return;
      }

      if (msg.type === 'remote_student_register') {
         client.isRemoteStudent = true;
         client.studentName = msg.studentName;
         this.studentClients.set(msg.studentName, client);
         
         // Initialize state
         this.studentStates.set(msg.studentName, {
            studentName: msg.studentName,
            status: 'online',
            lastUpdate: Date.now(),
            telemetry: null
         });
         
         console.log(`Registered remote student: ${msg.studentName}`);
         this.notifyStudentChange();
         return;
      }

      // 2. Handle Student Telemetry
      if (msg.type === 'remote_student_telemetry' && client.isRemoteStudent) {
         const state = this.studentStates.get(client.studentName!);
         if (state) {
            state.telemetry = msg.telemetry;
            state.status = 'online'; // (running)
            state.lastUpdate = Date.now();
         }
         return;
      }

      // 3. Handle Trainer Commands (to be forwarded to Student)
      if (client.isTrainer && msg.type === 'trainer_command') {
         // Intercept asynchrony commands to log them into Analytics
         if (msg.payload && msg.payload.type === 'set_asynchrony') {
             const act = async () => {
                 const activeSession = await this.sessionsService.findActiveSession(msg.targetStudent);
                 if (activeSession) {
                     await this.sessionsService.logAsynchronyStart(activeSession.id, msg.payload.asynchronyType);
                 }
             };
             act().catch(e => console.error('Failed to log asynchrony start', e));
         }

         // Forward command to specific student
         const targetStudent = this.studentClients.get(msg.targetStudent);
         if (targetStudent && targetStudent.readyState === 1) { // 1 = OPEN
            targetStudent.send(JSON.stringify(msg.payload)); // e.g., set_asynchrony
         }
      }

      // 4. Handle Analytics Events from Student
      if (msg.type === 'student_event' && client.isRemoteStudent) {
         const act = async () => {
             const activeSession = await this.sessionsService.findActiveSession(msg.studentName);
             if (activeSession) {
                 if (msg.event === 'setting_change') {
                     await this.sessionsService.logSettingChange(
                         activeSession.id,
                         msg.parameter,
                         msg.previousValue,
                         msg.newValue,
                         msg.wasAsynchronyActive,
                         msg.asynchronyType
                     );
                 } else if (msg.event === 'asynchrony_resolved') {
                     await this.sessionsService.logAsynchronyEnd(activeSession.id, msg.asynchronyType);
                 }
             }
         };
         act().catch(e => console.error('Failed to log student event', e));
         return;
      }

    } catch (e) {
      console.error('Failed to parse WS message', e);
    }
  }

  private startBroadcasting() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastStudentStates();
    }, 500);
  }

  private sendStudentList(client: ExtendedWebSocket) {
    const stations = this.getStudentList();
    this.sendToClient(client, { type: 'stationsSnapshot', stations });
  }

  private broadcastStudentStates() {
    const studentsUpdate: any[] = [];
    
    for (const [studentName, state] of this.studentStates.entries()) {
      if (state.telemetry) {
         studentsUpdate.push({
           stationId: studentName, // frontend expects stationId
           studentName: studentName,
           status: state.status,
           scenarioName: state.telemetry.scenarioName,
           settings: state.telemetry.settings,
           asynchrony: state.telemetry.asynchrony,
           pressure: state.telemetry.pressure,
           flow: state.telemetry.flow,
           volume: state.telemetry.volume,
           lastUpdate: state.lastUpdate,
         });
      }
    }

    if (studentsUpdate.length > 0) {
       for (const station of studentsUpdate) {
         this.broadcast({ type: 'stationUpdate', station });
       }
    }
  }

  public getStudentList() {
    return Array.from(this.studentStates.values()).map(state => ({
        stationId: state.studentName, // frontend expects stationId
        studentName: state.studentName,
        isRegistered: true,
        isRunning: state.status === 'online', // simplification
        status: state.status,
        scenarioName: state.telemetry?.scenarioName || null,
        settings: state.telemetry?.settings || null,
        asynchrony: state.telemetry?.asynchrony || null,
        pressure: state.telemetry?.pressure || [],
        lastUpdate: state.lastUpdate,
    }));
  }

  private sendToClient(client: ExtendedWebSocket, data: any) {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(JSON.stringify(data));
    }
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    for (const client of this.trainerClients) {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(message);
      }
    }
  }

  notifyStudentChange() {
    const stations = this.getStudentList();
    this.broadcast({ type: 'stationsSnapshot', stations });
  }

  // Called locally by ScenariosService or SessionsService when Trainer initiates a scenario change etc.
  public sendCommandToStudent(studentName: string, command: string, payload: any) {
      if (command === 'set_asynchrony') {
          const act = async () => {
              const activeSession = await this.sessionsService.findActiveSession(studentName);
              if (activeSession) {
                  await this.sessionsService.logAsynchronyStart(activeSession.id, payload.asynchronyType);
              }
          };
          act().catch();
      }

      const target = this.studentClients.get(studentName);
      if (target && target.readyState === 1) { // 1 = OPEN
          target.send(JSON.stringify({
              type: 'trainer_command',
              command,
              ...payload
          }));
      }
  }
}
