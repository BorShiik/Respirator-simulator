import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioEntity, ScenarioBlock } from './scenario.entity';
import { AsynchronyType } from '../common/dto/ventilator.dto';

@Injectable()
export class ScenariosService {
  constructor(
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepo: Repository<ScenarioEntity>,
  ) {}

  async findAll(): Promise<ScenarioEntity[]> {
    return this.scenarioRepo.find({ where: { isActive: true } });
  }

  async findById(id: string): Promise<ScenarioEntity | null> {
    return this.scenarioRepo.findOne({ where: { id } });
  }

  async create(data: {
    name: string;
    description?: string;
    blocks: ScenarioBlock[];
    durationSeconds?: number;
    initialSettings?: Record<string, number>;
    initialResistance?: number;
    initialCompliance?: number;
  }): Promise<ScenarioEntity> {
    const scenario = this.scenarioRepo.create({
      name: data.name,
      description: data.description || '',
      blocks: data.blocks,
      durationSeconds: data.durationSeconds || 300,
      initialSettings: data.initialSettings || {},
      initialResistance: data.initialResistance !== undefined ? data.initialResistance : 10,
      initialCompliance: data.initialCompliance !== undefined ? data.initialCompliance : 50,
    });
    return this.scenarioRepo.save(scenario);
  }

  async update(id: string, data: Partial<ScenarioEntity>): Promise<ScenarioEntity | null> {
    await this.scenarioRepo.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.scenarioRepo.update(id, { isActive: false });
  }

  /**
   * Get active asynchrony at a given time
   */
  getActiveAsynchrony(scenario: ScenarioEntity, timeSeconds: number): AsynchronyType | null {
    for (const block of scenario.blocks) {
      if (block.type === 'ASYNCHRONY' && block.asynchronyType) {
        const blockEnd = block.startTime + (block.duration || 30);
        if (timeSeconds >= block.startTime && timeSeconds <= blockEnd) {
          return block.asynchronyType;
        }
      }
    }
    return null;
  }

  /**
   * Seed default scenarios for demo
   */
  async seedDefaultScenarios(): Promise<void> {
    const count = await this.scenarioRepo.count();
    if (count > 0) return;

    const defaultScenarios = [
      {
        name: 'Basic Training - Ineffective Trigger',
        description: 'Practice identifying and correcting ineffective trigger asynchrony',
        initialResistance: 12,
        initialCompliance: 40,
        blocks: [
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType, description: '', parameterChanges: {} },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Double Trigger Challenge',
        description: 'Identify and resolve double triggering',
        initialResistance: 15,
        initialCompliance: 30,
        blocks: [
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 20, duration: 60, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType, description: '', parameterChanges: {} },
          { id: 'b2', type: 'ASYNCHRONY' as const, startTime: 100, duration: 60, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType, description: '', parameterChanges: {} },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Mixed Asynchrony Scenario',
        description: 'Handle multiple types of asynchrony',
        initialResistance: 10,
        initialCompliance: 50,
        blocks: [
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 45, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType, description: '', parameterChanges: {} },
          { id: 'b2', type: 'ASYNCHRONY' as const, startTime: 90, duration: 45, asynchronyType: 'PREMATURE_CYCLING' as AsynchronyType, description: '', parameterChanges: {} },
          { id: 'b3', type: 'ASYNCHRONY' as const, startTime: 150, duration: 45, asynchronyType: 'FLOW_MISMATCH' as AsynchronyType, description: '', parameterChanges: {} },
        ],
        durationSeconds: 240,
      },
    ];

    for (const scenario of defaultScenarios) {
      await this.create(scenario);
    }
  }
}
