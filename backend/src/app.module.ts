import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationModule } from './simulation/simulation.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SessionsModule } from './sessions/sessions.module';

import { TrainerModule } from './trainer/trainer.module';
import { HardwareModule } from './hardware/hardware.module';
import { StudentModule } from './student/student.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'respirator.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-create tables (disable in production)
    }),
    SimulationModule,
    ScenariosModule,
    SessionsModule,

    TrainerModule,
    HardwareModule,
    StudentModule,
  ],
})
export class AppModule {}
