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
    initialSettings?: Record<string, any>;
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
    const defaultScenarios = [
      {
        name: 'Nieefektywny wyzwalacz',
        description: 'Pacjent podejmuje wysiłek oddechowy, ale respirator go ignoruje z powodu zbyt wysokiego progu wyzwalania. Rozwiązanie: zmniejsz czułość triggera lub IPAP.',
        initialResistance: 15,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.8 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 1.0, trigger: 15, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 15, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2.8, PTi: 0, PriorityPR: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'INEFFECTIVE_TRIGGER' as AsynchronyType,
            description: 'Nieefektywny wyzwalacz — próg triggera za wysoki', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0, PriorityPR: 0 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Podwójny wyzwalacz',
        description: 'Ciśnienie spada w trakcie wdechu, co powoduje drugi cykl wyzwalania. Rozwiązanie: wydłuż czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.0 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 0.6, trigger: 2, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'DOUBLE_TRIGGER' as AsynchronyType,
            description: 'Podwójny wyzwalacz — Pin spada do EPAP w trakcie wdechu', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1, DoubleTriggeringTime: 0.5 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Autowyzwalacz',
        description: 'Respirator wyzwala oddechy z własną częstością, niezależnie od pacjenta. Rozwiązanie: zwiększ próg triggera (mniejsza czułość).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 1.0, trigger: 2, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'AUTO_TRIGGER' as AsynchronyType,
            description: 'Autowyzwalacz — respirator oddycha z częstością 30/min', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0, PriorityPR: 30 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Opóźnione przełączenie',
        description: 'Respirator kontynuuje wdech po tym, jak pacjent zakończył fazę wdechową. Rozwiązanie: skróć czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 0.6 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 1.5, trigger: 2, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'DELAYED_CYCLING' as AsynchronyType,
            description: 'Opóźnione przełączenie — krótki PTi pacjenta vs długi Ti respiratora', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0.6 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Przedwczesne przełączenie',
        description: 'Respirator przerywa wdech zanim pacjent zakończył fazę wdechową. Rozwiązanie: wydłuż czas wdechu (Ti).',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.3 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 0.6, trigger: 2, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 0 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'PREMATURE_CYCLING' as AsynchronyType,
            description: 'Przedwczesne przełączenie — długi PTi pacjenta vs krótki Ti respiratora', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1.3 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Niedopasowanie przepływu',
        description: 'Zbyt wolny wzrost ciśnienia — przepływ nie nadąża za zapotrzebowaniem pacjenta. Rozwiązanie: zwiększ IPAP.',
        initialResistance: 20,
        initialCompliance: 30,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 2.0, PTi: 1.0 },
        initialSettings: { ipap: 15, epap: 5, peep: 5, rr: 15, ti: 1.0, trigger: 2, vt: 500, pinsp: 15, mode: 'VC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1 },
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'FLOW_MISMATCH' as AsynchronyType,
            description: 'Niedopasowanie przepływu — PressureRaiseT za duży', parameterChanges: {},
            resistance: 20, compliance: 30, rin: 1, rout: 20, p01: 2, Tcykl: 2, PTi: 1, PressureRaiseT: 0.3 },
        ],
        durationSeconds: 40,
      },
      {
        name: 'Odwrócony wyzwalacz',
        description: 'Wdech mechaniczny wywołuje odruchowy wysiłek mięśniowy pacjenta (zjawisko odwróconego wyzwalania). Scenariusz demonstracyjny.',
        initialResistance: 10,
        initialCompliance: 50,
        initialPatientParams: this.defaultPatientParams(),
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 15, ti: 1.0, trigger: 2, vt: 500, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b1', type: 'ASYNCHRONY' as const, startTime: 5, duration: 30, asynchronyType: 'REVERSE_TRIGGER' as AsynchronyType,
            description: 'Odwrócony wyzwalacz — brak fizyki (placeholder)', parameterChanges: {} },
        ],
        durationSeconds: 40,
      },

      // ═══════════════════════════════════════════════════════════════════
      // CLINICAL DEMO SCENARIOS — normal respiration for different patient
      // profiles.  No asynchronies; intended for presentation of waveform
      // differences between patient categories.
      // ═══════════════════════════════════════════════════════════════════

      {
        name: 'Zdrowy dorosły (70 kg)',
        description: 'Pacjent dorosły ~70 kg z prawidłową mechaniką płuc, wentylowany po planowym zabiegu chirurgicznym. Stabilna wentylacja — wzorcowe krzywe ciśnienia, przepływu i objętości.',
        initialResistance: 5,
        initialCompliance: 60,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 2, Tcykl: 4.0, PTi: 1.2, rout: 10 },
        initialSettings: { ipap: 15, epap: 5, peep: 5, rr: 14, ti: 1.0, trigger: 2, vt: 500, pinsp: 15, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 600, description: 'Stabilna wentylacja — prawidłowa mechanika płuc',
            parameterChanges: {}, resistance: 5, compliance: 60, rin: 1, rout: 10, p01: 2, Tcykl: 4.0, PTi: 1.2, PriorityPR: 0 },
        ],
        durationSeconds: 600,
      },

      {
        name: 'Dziecko 1–5 lat (15 kg)',
        description: 'Dziecko ~15 kg z prawidłową mechaniką płuc, pediatryczne parametry wentylacji. Wąskie drogi oddechowe → wyższy opór, mały VT (~120 mL), wysoka częstość oddechów.',
        initialResistance: 15,
        initialCompliance: 20,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 1.5, Tcykl: 2.0, PTi: 0.6, rin: 2, rout: 15 },
        initialSettings: { ipap: 14, epap: 4, peep: 4, rr: 25, ti: 0.7, trigger: 1, vt: 120, pinsp: 14, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 600, description: 'Stabilna wentylacja — parametry pediatryczne',
            parameterChanges: {}, resistance: 15, compliance: 20, rin: 2, rout: 15, p01: 1.5, Tcykl: 2.0, PTi: 0.6, PriorityPR: 0 },
        ],
        durationSeconds: 600,
      },

      {
        name: 'Astma oskrzelowa (zaostrzenie)',
        description: 'Dorosły 70 kg z ciężkim zaostrzeniem astmy. Znacznie zwiększony opór dróg oddechowych (skurcz oskrzeli), pułapka powietrzna (air trapping). Strategia: niski RR, długi czas wydechu.',
        initialResistance: 25,
        initialCompliance: 50,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 4, Tcykl: 3.0, PTi: 1.0, rin: 3, rout: 30 },
        initialSettings: { ipap: 20, epap: 5, peep: 5, rr: 12, ti: 1.0, trigger: 2, vt: 450, pinsp: 20, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji — astma z podwyższonym oporem',
            parameterChanges: {}, resistance: 25, compliance: 50, rin: 3, rout: 30, p01: 4, Tcykl: 3.0, PTi: 1.0, PriorityPR: 0 },
          { id: 'b1', type: 'NORMAL' as const, startTime: 5, duration: 595, description: 'Zaostrzenie skurczu oskrzeli — R↑ do 30, rout↑ do 35 → air trapping, auto-PEEP',
            parameterChanges: {}, resistance: 30, compliance: 50, rin: 3, rout: 35, p01: 4, Tcykl: 3.0, PTi: 1.0, PriorityPR: 0 },
        ],
        durationSeconds: 600,
      },

      {
        name: 'ARDS (ciężki)',
        description: 'Dorosły 70 kg z ciężkim ARDS. Krytycznie obniżona podatność płuc (\"sztywne płuca\"), wysoki PEEP (12), wentylacja protekcyjna (niski VT ~6 mL/kg). Driving pressure < 15 cmH₂O.',
        initialResistance: 8,
        initialCompliance: 15,
        initialPatientParams: { ...this.defaultPatientParams(), p01: 5, Tcykl: 2.5, PTi: 0.8, rout: 10 },
        initialSettings: { ipap: 25, epap: 12, peep: 12, rr: 20, ti: 0.8, trigger: 3, vt: 350, pinsp: 25, mode: 'PC-CMV', pressureRaiseT: 0 },
        blocks: [
          { id: 'b0', type: 'NORMAL' as const, startTime: 0, duration: 5, description: 'Faza stabilizacji — ciężki ARDS',
            parameterChanges: {}, resistance: 8, compliance: 15, rin: 1, rout: 10, p01: 5, Tcykl: 2.5, PTi: 0.8, PriorityPR: 0 },
          { id: 'b1', type: 'NORMAL' as const, startTime: 5, duration: 595, description: 'Progresja ARDS — C↓ do 12, p01↑ do 6 → jeszcze sztywniejsze płuca',
            parameterChanges: {}, resistance: 8, compliance: 12, rin: 1, rout: 10, p01: 6, Tcykl: 2.5, PTi: 0.8, PriorityPR: 0 },
        ],
        durationSeconds: 600,
      },
    ];

    for (const scenario of defaultScenarios) {
      const existingScenario = await this.scenarioRepo.findOne({ where: { name: scenario.name } });
      if (existingScenario) {
        await this.scenarioRepo.update(existingScenario.id, {
          description: scenario.description,
          initialResistance: scenario.initialResistance,
          initialCompliance: scenario.initialCompliance,
          initialPatientParams: scenario.initialPatientParams,
          blocks: scenario.blocks,
          durationSeconds: scenario.durationSeconds,
          initialSettings: scenario.initialSettings as any,
        });
      } else {
        await this.create(scenario);
      }
    }
  }
}

