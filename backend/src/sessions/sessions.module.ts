import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity, SessionLogEntity } from './session.entity';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity, SessionLogEntity])],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
