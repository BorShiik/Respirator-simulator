import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'ws';
import * as WebSocketLib from 'ws';
import { SessionsService } from '../sessions/sessions.service';

// TrainerGateway handles both Trainer UI clients AND incoming data from remote Student Pi's.

interface ExtendedWebSocket extends WebSocket {
  isTrainer?: boolean;
  isRemoteStudent?: boolean;
  stationId?: string;
  studentName?: string;
  on: (event: string, listener: (data: Buffer | string) => void) => void;
  send: (data: string | Buffer) => void;
  readyState: number;
}

@WebSocketGateway({
  path: '/api/trainer/ws',
})
export class TrainerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrainerGateway.name);
  private trainerClients: Set<ExtendedWebSocket> = new Set();
  private studentClients: Map<string, ExtendedWebSocket> = new Map();

  // Cache of latest student states received via telemetry
  private studentStates: Map<string, any> = new Map();

  constructor(private readonly sessionsService: SessionsService) {}

  handleConnection(client: ExtendedWebSocket) {
    this.logger.log('Client connected to Trainer Gateway');

    client.on('message', (data: Buffer | string) => {
      this.handleMessage(client, data.toString());
    });
  }

  handleDisconnect(client: ExtendedWebSocket) {
    if (client.isTrainer) {
      this.logger.log('Trainer disconnected');
      this.trainerClients.delete(client);
    }

    if (client.isRemoteStudent && client.stationId) {
      this.logger.log(`Remote Student disconnected: ${client.studentName} from ${client.stationId}`);
      this.studentClients.delete(client.stationId);
      
      // Auto-abort any active session for this student
      const stationId = client.stationId;
      const act = async () => {
          const activeSession = await this.sessionsService.findActiveSession(stationId);
          if (activeSession) {
              await this.sessionsService.abort(activeSession.id);
              this.logger.log(`Auto-aborted session ${activeSession.id} for disconnected station ${stationId}`);
          }
      };
      act().catch(e => console.error('Failed to auto-abort session on disconnect', e));
      
      // Mark as disconnected but keep last known telemetry for reference
      const state = this.studentStates.get(client.stationId);
      if (state) {
        state.status = 'offline';
        this.notifyStudentChange();
      }
    }
  }

  private handleMessage(client: ExtendedWebSocket, rawData: string) {
    try {
      const msg = JSON.parse(rawData);

      // 1. Differentiate Client Type
      if (msg.type === 'trainer_register') {
         client.isTrainer = true;
         this.trainerClients.add(client);
         this.sendStudentList(client);
         return;
      }

      if (msg.type === 'remote_student_register') {
         const stationId = msg.stationId || msg.studentName;
         client.isRemoteStudent = true;
         client.stationId = stationId;
         client.studentName = msg.studentName;
         this.studentClients.set(stationId, client);
         
         // Initialize state
         this.studentStates.set(stationId, {
            stationId: stationId,
            studentName: msg.studentName,
            status: 'online',
            simulationStatus: 'running',
            lastUpdate: Date.now(),
            telemetry: null
         });
         
         this.logger.log(`Registered remote student: ${msg.studentName} at ${stationId}`);
         
         // Send confirmation back to student
         this.sendToClient(client, {
            type: 'registration_success',
            studentName: msg.studentName,
            stationId: stationId
         });

         this.notifyStudentChange();
         return;
      }

      // 2. Handle Student Telemetry
      if (msg.type === 'remote_student_telemetry' && client.isRemoteStudent) {
         const state = this.studentStates.get(client.stationId!);
         if (state) {
            state.telemetry = msg.telemetry;
            state.status = 'online'; // (running)
            state.lastUpdate = Date.now();
            
            // Forward instantly to connected trainers
            this.broadcast({
              type: 'stationUpdate',
              station: {
                 stationId: client.stationId,
                 studentName: client.studentName,
                 status: state.status,
                 isRunning: state.simulationStatus !== 'paused',
                 scenarioName: state.telemetry.scenarioName,
                 settings: state.telemetry.settings,
                 asynchrony: state.telemetry.asynchrony,
                 pressure: state.telemetry.pressure,
                 flow: state.telemetry.flow,
                 volume: state.telemetry.volume,
                 lastUpdate: state.lastUpdate,
              }
            });
         }
         return;
      }

      // 2b. Handle direct simulation active status updates
      if (msg.type === 'remote_student_status' && client.isRemoteStudent) {
         const state = this.studentStates.get(client.stationId!);
         if (state) {
            state.simulationStatus = msg.status;
            this.notifyStudentChange();
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

         // Forward command to specific student (targetStudent is actually stationId)
         const targetStudent = this.studentClients.get(msg.targetStudent);
         if (targetStudent && targetStudent.readyState === WebSocketLib.OPEN) {
            targetStudent.send(JSON.stringify(msg.payload)); // e.g., set_asynchrony
         }
      }

      // 4. Handle Analytics Events from Student
      if (msg.type === 'student_event' && client.isRemoteStudent) {
         const act = async () => {
             const activeSession = await this.sessionsService.findActiveSession(client.stationId!);
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
                 } else if (msg.event === 'asynchrony_injected') {
                     await this.sessionsService.logAsynchronyStart(activeSession.id, msg.asynchronyType);
                 }
             }
         };
         act().catch(e => console.error('Failed to log student event', e));
         return;
      }

      // 5. Handle Session Lifecycle from Student
      if (msg.type === 'student_session_start' && client.isRemoteStudent) {
         const act = async () => {
             const stationId = client.stationId!;
             const studentName = client.studentName;
             const scenarioName = msg.scenarioName || 'Free Practice';
             
             // Check if there's already a pending session (assigned by trainer)
             const pendingSession = await this.sessionsService.findPendingSession(stationId);
             if (pendingSession) {
                 // Trainer already assigned a scenario → use that session
                 await this.sessionsService.start(pendingSession.id);
                 this.logger.log(`Started pending session ${pendingSession.id} for ${stationId}`);
             } else {
                 // No pending session → check if there's already a running one
                 const activeSession = await this.sessionsService.findActiveSession(stationId);
                 if (!activeSession) {
                     // Create and immediately start a new session
                     const newSession = await this.sessionsService.create({
                         stationId: stationId,
                         studentName,
                         scenarioName,
                     });
                     await this.sessionsService.start(newSession.id);
                     this.logger.log(`Created & started new session for ${stationId} (${scenarioName})`);
                 }
             }
         };
         act().catch(e => console.error('Failed to handle student_session_start', e));
         return;
      }

      if (msg.type === 'student_session_stop' && client.isRemoteStudent) {
         const act = async () => {
             const stationId = client.stationId!;
             const activeSession = await this.sessionsService.findActiveSession(stationId);
             if (activeSession) {
                 await this.sessionsService.complete(activeSession.id, activeSession.initialSettings);
                 this.logger.log(`Completed session ${activeSession.id} for ${stationId}`);
             }
         };
         act().catch(e => console.error('Failed to handle student_session_stop', e));
         return;
      }

    } catch (e) {
      console.error('Failed to parse WS message', e);
    }
  }

  private sendStudentList(client: ExtendedWebSocket) {
    const stations = this.getStudentList();
    this.sendToClient(client, { type: 'stationsSnapshot', stations });
  }

  public getStudentList() {
    return Array.from(this.studentStates.values()).map(state => ({
        stationId: state.stationId,
        studentName: state.studentName,
        isRegistered: true,
        isRunning: state.simulationStatus !== 'paused',
        status: state.status,
        scenarioName: state.telemetry?.scenarioName || null,
        settings: state.telemetry?.settings || null,
        asynchrony: state.telemetry?.asynchrony || null,
        pressure: state.telemetry?.pressure || [],
        volume: state.telemetry?.volume || [],
        flow: state.telemetry?.flow || [],
        lastUpdate: state.lastUpdate,
    }));
  }

  private sendToClient(client: ExtendedWebSocket, data: any) {
    if (client.readyState === WebSocketLib.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    for (const client of this.trainerClients) {
      if (client.readyState === WebSocketLib.OPEN) {
        client.send(message);
      }
    }
  }

  notifyStudentChange() {
    const stations = this.getStudentList();
    this.broadcast({ type: 'stationsSnapshot', stations });
  }

  // Called locally by ScenariosService or SessionsService when Trainer initiates a scenario change etc.
  public sendCommandToStudent(stationId: string, command: string, payload: any) {
      if (command === 'set_asynchrony') {
          const act = async () => {
              const activeSession = await this.sessionsService.findActiveSession(stationId);
              if (activeSession) {
                  await this.sessionsService.logAsynchronyStart(activeSession.id, payload.asynchronyType);
              }
          };
          act().catch(e => console.error('Failed to log asynchrony from sendCommand', e));
      }

      const target = this.studentClients.get(stationId);
      if (target && target.readyState === WebSocketLib.OPEN) {
          target.send(JSON.stringify({
              type: 'trainer_command',
              command,
              ...payload
          }));
      }
  }
}
