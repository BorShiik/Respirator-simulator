import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenarioEntity } from './scenario.entity';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScenarioEntity])],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule implements OnModuleInit {
  constructor(private readonly scenariosService: ScenariosService) {}

  async onModuleInit() {
    // Seed default scenarios on startup
    await this.scenariosService.seedDefaultScenarios();
  }
}
