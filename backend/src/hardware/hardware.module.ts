import { Module } from '@nestjs/common';
import { GpioService } from './gpio.service';

@Module({
  providers: [GpioService],
  exports: [GpioService],
})
export class HardwareModule {}
