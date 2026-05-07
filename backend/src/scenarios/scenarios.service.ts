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
    initialPatientParams?: Record<string, number | boolean>;
    difficulty?: string;
  }): Promise<ScenarioEntity> {
    const scenario = this.scenarioRepo.create({
      name: data.name,
      description: data.description || '',
      blocks: data.blocks,
      durationSeconds: data.durationSeconds || 300,
      initialSettings: data.initialSettings || {},
      initialResistance: data.initialResistance !== undefined ? data.initialResistance : 10,
      initialCompliance: data.initialCompliance !== undefined ? data.initialCompliance : 50,
      initialPatientParams: data.initialPatientParams || null,
      difficulty: data.difficulty || 'EASY',
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
   * Default ILSim patient parameters (used in seed scenarios)
   */
  private defaultPatientParams() {
    return {
      rin: 1,
      rout: 20,
      p01: 0,
      Tcykl: 3.0,
      PTi: 1.0,
      PriorityPR: 0,
      PressureRaiseT: 0,
      DoubleTriggeringTime: 0,
      knobDisable: false,
    };
  }

  /**
   * Seed default scenarios for demo
   */
  async seedDefaultScenarios(): Promise<void> {
    const existing = await this.scenarioRepo.find({ select: ['name'] });
    const existingNames = new Set(existing.map(s => s.name));

    const defaultScenarios = [
      {
        name: 'Nieefektywny wyzwalacz',
        description: 'Pacjent podejmuje wysiłek oddechowy, ale respirator go ignoruje z powodu zbyt wysokiego progu wyzwalania. Rozwiązanie: zmniejsz czułość triggera lub IPAP.',
        initialResistance: 15,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.8 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 15, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2.8, PTi: 0, PriorityPR: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType,
            description: 'Nieefektywny wyzwalacz — próg triggera za wysoki', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0, PriorityPR: 0 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Podwójny wyzwalacz',
        description: 'Ciśnienie spada w trakcie wdechu, co powoduje drugi cykl wyzwalania. Rozwiązanie: wydłuż czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType,
            description: 'Podwójny wyzwalacz — Pin spada do EPAP w trakcie wdechu', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1, DoubleTriggeringTime: 0.5 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Autowyzwalacz',
        description: 'Respirator wyzwala oddechy z własną częstością, niezależnie od pacjenta. Rozwiązanie: zwiększ próg triggera (mniejsza czułość).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'AUTO_TRIGGER' as AsynchronyType,
            description: 'Autowyzwalacz — respirator oddycha z częstością 30/min', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0, PriorityPR: 30 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Opóźnione przełączenie',
        description: 'Respirator kontynuuje wdech po tym, jak pacjent zakończył fazę wdechową. Rozwiązanie: skróć czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 0.6 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'DELAYED_CYCLING' as AsynchronyType,
            description: 'Opóźnione przełączenie — krótki PTi pacjenta vs długi Ti respiratora', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0.6 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Przedwczesne przełączenie',
        description: 'Respirator przerywa wdech zanim pacjent zakończył fazę wdechową. Rozwiązanie: wydłuż czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.3 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'PREMATURE_CYCLING' as AsynchronyType,
            description: 'Przedwczesne przełączenie — długi PTi pacjenta vs krótki Ti respiratora', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1.3 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Niedopasowanie przepływu',
        description: 'Zbyt wolny wzrost ciśnienia — przepływ nie nadąża za zapotrzebowaniem pacjenta. Rozwiązanie: zwiększ IPAP.',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 30, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'FLOW_MISMATCH' as AsynchronyType,
            description: 'Niedopasowanie przepływu — PressureRaiseT za duży', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1, PressureRaiseT: 0.3 },
        ],
        durationSeconds: 180,
      },
      {
        name: 'Odwrócony wyzwalacz',
        description: 'Wdech mechaniczny wywołuje odruchowy wysiłek mięśniowy pacjenta (zjawisko odwróconego wyzwalania). Scenariusz demonstracyjny.',
        initialResistance: 10,
        initialCompliance: 50,
        initialPatientParams: this.defaultPatientParams(),
        blocks: [
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 30, duration: 120, asynchronyType: 'REVERSE_TRIGGER' as AsynchronyType,
            description: 'Odwrócony wyzwalacz — brak fizyki (placeholder)', parameterChanges: {} },
        ],
        durationSeconds: 180,
      },
    ];

    for (const scenario of defaultScenarios) {
      if (!existingNames.has(scenario.name)) {
        await this.create(scenario);
      }
    }
  }
}

