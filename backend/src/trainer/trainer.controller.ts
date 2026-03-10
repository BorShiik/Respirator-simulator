import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SessionsService } from '../sessions/sessions.service';
import { TrainerGateway } from './trainer.gateway';
import { ScenarioEvent } from '../scenarios/scenario.entity';

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
    
    // Also if starting a scenario, we might want to log it in SessionsService
    if (body.command === 'start' && body.scenarioId) {
        // The trainer UI assigned a scenario
        const scenario = await this.scenariosService.findById(body.scenarioId);
        if (scenario) {
            await this.sessionsService.create({
              stationId: studentName,
              studentName,
              scenarioId: body.scenarioId,
              scenarioName: scenario.name,
            });
        }
    } else if (body.command === 'stop') {
        // Handle stopping logic if necessary (session closure)
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
         scenarioName: scenario.name
      });
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
      events: ScenarioEvent[];
      durationSeconds?: number;
      initialSettings?: Record<string, number>;
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
      events: ScenarioEvent[];
      durationSeconds: number;
      initialSettings: Record<string, number>;
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
