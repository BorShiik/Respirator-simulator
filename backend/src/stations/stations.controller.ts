import { Controller, Post, Param, Body, HttpCode } from '@nestjs/common';
import { StationsGateway } from './stations.gateway';

@Controller('students')
export class StudentsController {
  constructor(private readonly stationsGateway: StationsGateway) {}

  @Post(':studentName/command')
  @HttpCode(200)
  async sendCommand(
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
      message: success ? `Command ${body.command} sent` : 'Student not found',
    };
  }
}
