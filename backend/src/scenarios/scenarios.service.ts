import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioEntity, ScenarioEvent } from './scenario.entity';
import { AsynchronyType } from '../common/dto';

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
    events: ScenarioEvent[];
    durationSeconds?: number;
    initialSettings?: Record<string, number>;
  }): Promise<ScenarioEntity> {
    const scenario = this.scenarioRepo.create({
      name: data.name,
      description: data.description || '',
      events: data.events,
      durationSeconds: data.durationSeconds || 300,
      initialSettings: data.initialSettings || {},
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
   * Get events that should trigger at a given time
   */
  getEventsAtTime(scenario: ScenarioEntity, timeSeconds: number): ScenarioEvent[] {
    return scenario.events.filter(event => {
      const eventEnd = event.time + (event.duration || 0);
      return timeSeconds >= event.time && timeSeconds <= eventEnd;
    });
  }

  /**
   * Get active asynchrony at a given time
   */
  getActiveAsynchrony(scenario: ScenarioEntity, timeSeconds: number): AsynchronyType | null {
    for (const event of scenario.events) {
      if (event.type === 'asynchrony' && event.asynchronyType) {
        const eventEnd = event.time + (event.duration || 30); // Default 30 seconds
        if (timeSeconds >= event.time && timeSeconds <= eventEnd) {
          return event.asynchronyType;
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
        events: [
          { time: 30, type: 'asynchrony' as const, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType, duration: 120 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Double Trigger Challenge',
        description: 'Identify and resolve double triggering',
        events: [
          { time: 20, type: 'asynchrony' as const, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType, duration: 60 },
          { time: 100, type: 'asynchrony' as const, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType, duration: 60 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Mixed Asynchrony Scenario',
        description: 'Handle multiple types of asynchrony',
        events: [
          { time: 30, type: 'asynchrony' as const, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType, duration: 45 },
          { time: 90, type: 'asynchrony' as const, asynchronyType: 'PREMATURE_CYCLING' as AsynchronyType, duration: 45 },
          { time: 150, type: 'asynchrony' as const, asynchronyType: 'FLOW_MISMATCH' as AsynchronyType, duration: 45 },
        ],
        durationSeconds: 240,
      },
    ];

    for (const scenario of defaultScenarios) {
      await this.create(scenario);
    }
  }
}
