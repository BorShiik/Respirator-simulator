import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
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

  private localUiClient: WebSocket | null = null;
  private currentStudentName: string | null = null;

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

        // E.g., change Respiratory Rate on rotation
        // A real impl needs an active parameter selector like in UI.
        // For now, let's just send the event to the UI so it can handle it, or update backend directly.
        // If the backend handles it via GpioService selectedParameter:
        const param = this.gpioService.getSelectedParameter();
        const config = (this.gpioService.getParameterConfig() as any)[param];
        if (config) {
            const currentValue = (currentSimState.settings as any)[param] || 0;
            const newValue = this.gpioService.calculateNewValue(currentValue, config, event.direction, event.clicks);
            
            const updatedSettings = { ...currentSimState.settings, [param]: newValue };
            if (param === 'ipap') updatedSettings.pinsp = newValue;
            if (param === 'epap') updatedSettings.peep = newValue;

            this.simulationService.updateSettings(this.currentStudentName, updatedSettings as any);

            // Send back to UI immediately
            if (this.localUiClient && this.localUiClient.readyState === 1) {
                this.localUiClient.send(JSON.stringify({
                    type: 'settingsUpdate',
                    settings: updatedSettings
                }));
            }
        }
    });

    this.gpioService.on('button', (event) => {
        // Handle button logic
        if (event.action === 'press') {
           this.gpioService.selectNextParameter();
        }
    });

    this.gpioService.on('parameterChanged', (param) => {
        if (this.localUiClient && this.localUiClient.readyState === 1) {
            this.localUiClient.send(JSON.stringify({
                type: 'parameterSelected',
                parameter: param
            }));
        }
    });
  }

  handleConnection(client: WebSocket) {
    console.log('Local UI connected');
    this.localUiClient = client;

    // Awaiting registration by default
    client.send(JSON.stringify({ type: 'connected', status: 'awaiting_registration' }));

    client.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(client, msg);
      } catch (e) {
        console.error('Failed to parse UI message', e);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    console.log('Local UI disconnected');
    if (this.currentStudentName) {
      this.simulationService.stopSimulation(this.currentStudentName);
    }
    this.localUiClient = null;
  }

  private handleMessage(client: WebSocket, message: any) {
    switch (message.type || message.event) {
      case 'register':
        const name = (message.data?.studentName || message.studentName)?.trim();
        if (name) {
          this.currentStudentName = name;
          client.send(JSON.stringify({ type: 'registered', studentName: name, status: 'idle' }));
          
          // Register upstream
          this.linkService.registerWithMaster(name);

          // Start simulation automatically locally
          this.simulationService.startSimulation(name, 'Free Practice', (telemetry) => {
             // Send locally to UI
             if (this.localUiClient && this.localUiClient.readyState === WebSocket.OPEN) {
               this.localUiClient.send(JSON.stringify({
                 type: 'telemetry',
                 timestamp: telemetry.timestamp,
                 pressure: telemetry.pressure,
                 flow: telemetry.flow,
                 volume: telemetry.volume,
                 settings: telemetry.settings,
                 asynchrony: telemetry.asynchrony,
                 scenarioName: telemetry.scenarioName,
               }));
             }
             // Send to master
             this.linkService.sendTelemetryToMaster(telemetry);
          });
          
          client.send(JSON.stringify({ type: 'status', status: 'running', scenarioName: 'Free Practice', studentName: name }));
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

      case 'stop':
        if (this.currentStudentName) {
          this.simulationService.stopSimulation(this.currentStudentName);
          client.send(JSON.stringify({ type: 'status', status: 'stopped' }));
        }
        break;
    }
  }
}
