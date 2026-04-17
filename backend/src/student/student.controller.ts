import { Controller, Post, Param, Body, HttpCode, Logger } from '@nestjs/common';
import { StudentUiGateway } from './student-ui.gateway';

@Controller('students')
export class StudentController {
  private readonly logger = new Logger(StudentController.name);

  constructor(
    private readonly studentUiGateway: StudentUiGateway,
  ) {}

  @Post(':studentName/command')
  @HttpCode(200)
  async handleCommand(
    @Param('studentName') studentName: string,
    @Body() body: { command: 'start' | 'stop' | 'reset' | 'pause' | 'continue'; scenarioId?: string },
  ) {
    this.logger.log(`Received command ${body.command} for student ${studentName}`);

    switch (body.command) {
      case 'start':
        this.studentUiGateway.startSimulation();
        break;

      case 'stop':
        this.studentUiGateway.stopSimulation();
        break;

      case 'reset':
        this.studentUiGateway.resetSimulation();
        break;
      case 'pause':
        this.studentUiGateway.pauseSimulation();
        break;

      case 'continue':
        this.studentUiGateway.resumeSimulation();
        break;
    }

    return {
      success: true,
      message: `Command ${body.command} processed for ${studentName}`,
    };
  }
}
