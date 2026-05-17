import { Module } from '@nestjs/common';
import { StudentLinkService } from './student-link.service';
import { StudentUiGateway } from './student-ui.gateway';
import { StudentController } from './student.controller';
import { SimulationModule } from '../simulation/simulation.module';
import { HardwareModule } from '../hardware/hardware.module';

@Module({
  imports: [SimulationModule, HardwareModule],
  controllers: [StudentController],
  providers: [StudentLinkService, StudentUiGateway],
  exports: [StudentLinkService],
})
export class StudentModule {}
