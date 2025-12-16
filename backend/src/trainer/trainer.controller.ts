import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SessionsService } from '../sessions/sessions.service';
import { StationsGateway } from '../stations/stations.gateway';
import { SimulationService } from '../simulation/simulation.service';
import { ScenarioEvent } from '../scenarios/scenario.entity';

@Controller('trainer')
export class TrainerController {
  constructor(
    private readonly scenariosService: ScenariosService,
    private readonly sessionsService: SessionsService,
    private readonly stationsGateway: StationsGateway,
    private readonly simulationService: SimulationService,
  ) {}

  // === Students (formerly Stations) ===
  @Get('students')
  getStudents() {
    const studentNames = this.stationsGateway.getConnectedStudents();
    return studentNames.map((studentName) => {
      const studentInfo = this.stationsGateway.getStudentInfo(studentName);
      const simState = this.simulationService.getState(studentName);
      return {
        studentName,
        isRegistered: studentInfo?.isRegistered || false,
        status: studentInfo?.isRunning ? 'running' : 'idle',
        scenarioId: studentInfo?.scenarioId || null,
        scenarioName: simState?.scenarioName || null,
        sessionId: studentInfo?.sessionId || null,
        settings: simState?.settings || null,
        asynchrony: simState?.asynchrony || null,
      };
    });
  }

  @Post('students/:studentName/command')
  @HttpCode(200)
  async commandStudent(
    @Param('studentName') studentName: string,
    @Body() body: { command: 'start' | 'stop' | 'reset'; scenarioId?: string },
  ) {
    const success = await this.stationsGateway.commandStudent(
      studentName,
      body.command,
      body.scenarioId,
    );
    return {
      success,
      message: success ? `Command ${body.command} executed` : 'Student not found',
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
