import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SessionsModule } from './sessions/sessions.module';
import { TrainerModule } from './trainer/trainer.module';
import { RoomsModule } from './trainer/rooms/rooms.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'respirator-trainer.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-create tables (disable in production)
    }),
    ScenariosModule,
    SessionsModule,
    TrainerModule,
    RoomsModule,
  ],
})
export class AppTrainerModule {}
