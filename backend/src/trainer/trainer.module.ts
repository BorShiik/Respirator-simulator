import { Module } from '@nestjs/common';
import { TrainerGateway } from './trainer.gateway';
import { TrainerController } from './trainer.controller';

import { ScenariosModule } from '../scenarios/scenarios.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SimulationModule } from '../simulation/simulation.module';

@Module({
  imports: [ScenariosModule, SessionsModule, SimulationModule],
  controllers: [TrainerController],
  providers: [TrainerGateway],
})
export class TrainerModule {}
