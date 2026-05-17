import { Module } from '@nestjs/common';
import { SimulationModule } from './simulation/simulation.module';
import { HardwareModule } from './hardware/hardware.module';
import { StudentModule } from './student/student.module';

@Module({
  imports: [
    SimulationModule,
    HardwareModule,
    StudentModule,
  ],
})
export class AppStudentModule {}
