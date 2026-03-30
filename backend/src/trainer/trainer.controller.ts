import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SessionsService } from '../sessions/sessions.service';
import { TrainerGateway } from './trainer.gateway';
import { ScenarioBlock } from '../scenarios/scenario.entity';

@Controller('trainer')
export class TrainerController {
  constructor(
    private readonly scenariosService: ScenariosService,
    private readonly sessionsService: SessionsService,
    private readonly trainerGateway: TrainerGateway,
  ) {}

  // === Students (formerly Stations) ===
  @Get('students')
  getStudents() {
    return this.trainerGateway.getStudentList();
  }

  @Post('students/:studentName/command')
  @HttpCode(200)
  async commandStudent(
    @Param('studentName') studentName: string,
    @Body() body: { command: 'start' | 'stop' | 'reset'; scenarioId?: string },
  ) {
    // Send command to remote student via websocket
    this.trainerGateway.sendCommandToStudent(studentName, body.command, { scenarioId: body.scenarioId });
    
    // If starting a simulation, change the pending session for this station to running to start analytics logic
    if (body.command === 'start') {
        const pendingSession = await this.sessionsService.findPendingSession(studentName);
        if (pendingSession) {
            await this.sessionsService.start(pendingSession.id);
        } else {
            // Free Practice Mode: No pending session exists, so we create one dynamically and start it immediately
            const activeSession = await this.sessionsService.findActiveSession(studentName);
            if (!activeSession) {
                const newSession = await this.sessionsService.create({
                    stationId: studentName,
                    studentName: studentName,
                    scenarioId: undefined, // Not tied to a scenario
                    scenarioName: 'Free Practice',
                });
                await this.sessionsService.start(newSession.id);
            }
        }
    } else if (body.command === 'stop') {
        const activeSession = await this.sessionsService.findActiveSession(studentName);
        if (activeSession) {
            await this.sessionsService.complete(activeSession.id, activeSession.initialSettings);
        }
    }

    return {
      success: true,
      message: `Command ${body.command} sent to ${studentName}`,
    };
  }

  @Post('students/:studentName/assign')
  @HttpCode(200)
  async assignScenario(
    @Param('studentName') studentName: string,
    @Body() body: { scenarioId: string },
  ) {
    const scenario = await this.scenariosService.findById(body.scenarioId);
    if (!scenario) {
      return { success: false, message: 'Scenario not found' };
    }

    // Create a new session for this assignment
    const session = await this.sessionsService.create({
      stationId: studentName, // backward compatibility
      studentName,
      scenarioId: body.scenarioId,
      scenarioName: scenario.name,
    });

    // Notify the remote student to apply the scenario settings
    if (scenario.initialSettings) {
      this.trainerGateway.sendCommandToStudent(studentName, 'update_settings', {
         settings: scenario.initialSettings,
         scenarioName: scenario.name,
         scenario: scenario // Add the full scenario object so the student node can schedule events
      });
    } else {
      this.trainerGateway.sendCommandToStudent(studentName, 'update_settings', {
         scenarioName: scenario.name,
         scenario: scenario // Send scenario even without initial settings
      });
    }

    // Notify to apply patient physics
    if (scenario.initialCompliance !== undefined || scenario.initialResistance !== undefined) {
      this.trainerGateway.sendCommandToStudent(studentName, 'update_patient', {
         parameters: {
            compliance: scenario.initialCompliance,
            resistance: scenario.initialResistance,
         }
      });
    }

    // Check if there are immediate blocks (like asynchrony starting at time 0)
    if (scenario.blocks && scenario.blocks.length > 0) {
      const immediateBlocks = scenario.blocks.filter(b => b.startTime === 0);
      for (const block of immediateBlocks) {
        if (block.type === 'ASYNCHRONY') {
          this.trainerGateway.sendCommandToStudent(studentName, 'set_asynchrony', {
             asynchronyType: block.asynchronyType
          });
        }
      }
    }

    return {
      success: true,
      sessionId: session.id,
      scenarioName: scenario.name,
    };
  }

  // === Sessions ===
  @Get('students/:studentName/sessions')
  async getStudentSessions(@Param('studentName') studentName: string) {
    // Find sessions by studentName (stored in stationId for backward compatibility)
    return this.sessionsService.findByStation(studentName);
  }

  @Get('sessions')
  async getAllSessions() {
    const sessions = await this.sessionsService.findAll();
    return sessions.map(s => this.sessionsService.mapSessionToFrontend(s));
  }

  @Get('sessions/:id')
  async getSession(@Param('id') sessionId: string) {
    return this.sessionsService.findById(sessionId);
  }

  @Get('sessions/:id/analytics')
  async getSessionAnalytics(@Param('id') sessionId: string) {
    return this.sessionsService.getSessionAnalytics(sessionId);
  }

  @Get('sessions/:id/logs')
  async getSessionLogs(@Param('id') sessionId: string) {
    return this.sessionsService.getSessionLogs(sessionId);
  }

  // === Scenarios ===
  @Get('scenarios')
  async getScenarios() {
    return this.scenariosService.findAll();
  }

  @Get('scenarios/:id')
  async getScenario(@Param('id') id: string) {
    return this.scenariosService.findById(id);
  }

  @Post('scenarios')
  async createScenario(
    @Body() body: {
      name: string;
      description?: string;
      blocks: ScenarioBlock[];
      durationSeconds?: number;
      initialSettings?: Record<string, number>;
      initialResistance?: number;
      initialCompliance?: number;
    },
  ) {
    return this.scenariosService.create(body);
  }

  @Put('scenarios/:id')
  async updateScenario(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      description: string;
      blocks: ScenarioBlock[];
      durationSeconds: number;
      initialSettings: Record<string, number>;
      initialResistance: number;
      initialCompliance: number;
    }>,
  ) {
    return this.scenariosService.update(id, body);
  }

  @Delete('scenarios/:id')
  @HttpCode(204)
  async deleteScenario(@Param('id') id: string) {
    await this.scenariosService.delete(id);
  }
}
