import { Module } from '@nestjs/common';
import { StationsGateway } from './stations.gateway';
import { StudentsController } from './stations.controller';
import { SimulationModule } from '../simulation/simulation.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ScenariosModule } from '../scenarios/scenarios.module';

@Module({
  imports: [SimulationModule, SessionsModule, ScenariosModule],
  controllers: [StudentsController],
  providers: [StationsGateway],
  exports: [StationsGateway],
})
export class StationsModule {}
