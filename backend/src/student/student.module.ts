import { Module } from '@nestjs/common';
import { StudentLinkService } from './student-link.service';
import { StudentUiGateway } from './student-ui.gateway';
import { SimulationModule } from '../simulation/simulation.module';
import { HardwareModule } from '../hardware/hardware.module';

@Module({
  imports: [SimulationModule, HardwareModule],
  providers: [StudentLinkService, StudentUiGateway],
  exports: [StudentLinkService],
})
export class StudentModule {}
