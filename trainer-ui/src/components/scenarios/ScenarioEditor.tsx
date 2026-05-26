import { useState, useEffect } from 'react';
import {
  Scenario,
  ScenarioBlock,
  VentilatorMode,
  AsynchronyType,
  PatientParams,
  DEFAULT_SCENARIO,
  DEFAULT_PATIENT_PARAMS,
  MODE_LABELS,
  ASYNCHRONY_LABELS,
  DIFFICULTY_LABELS,
} from '../../types/trainer';

interface ScenarioEditorProps {
  scenario: Scenario | null;
  onSave: (scenario: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const MODES: VentilatorMode[] = ['PC-CMV', 'PC-SIMV', 'PSV', 'CPAP', 'VC-CMV', 'VC-SIMV'];
const DIFFICULTIES: Scenario['difficulty'][] = ['EASY', 'MEDIUM', 'HARD'];
const ASYNCHRONY_TYPES: AsynchronyType[] = [
  'INEFFECTIVE_TRIGGER',
  'DOUBLE_TRIGGER',
  'AUTO_TRIGGER',
  'DELAYED_CYCLING',
  'PREMATURE_CYCLING',
  'FLOW_MISMATCH',
  'REVERSE_TRIGGER',
];

/** Labels for patient parameters in Polish */
const PATIENT_PARAM_LABELS: Record<keyof PatientParams, { label: string; unit: string; min: number; max: number; step: number }> = {
  rin:  { label: 'Rin (opór wdechowy)',       unit: 'cmH₂O/(L/s)', min: 0.1, max: 50,  step: 0.5 },
  rout: { label: 'Rout (opór wydechowy)',      unit: 'cmH₂O/(L/s)', min: 0.1, max: 100, step: 1 },
  p01:  { label: 'P01 (ciśnienie okluzji)',    unit: 'cmH₂O',       min: 0,   max: 10,  step: 0.5 },
  Tcykl:{ label: 'Tcykl (cykl oddechowy pac.)',unit: 's',            min: 0.5, max: 10,  step: 0.1 },
  PTi:  { label: 'PTi (czas wdechu pac.)',     unit: 's',            min: 0,   max: 5,   step: 0.1 },
  PriorityPR:       { label: 'PriorityPR (częstość priorytetowa)', unit: '/min', min: 0, max: 60, step: 1 },
  PressureRaiseT:   { label: 'PressureRaiseT (czas narastania)',   unit: 's',    min: 0, max: 2,  step: 0.1 },
  DoubleTriggeringTime: { label: 'DoubleTriggeringTime (czas podwójnego wyzwalania)', unit: 's', min: 0, max: 3, step: 0.1 },
  knobDisable:      { label: 'Blokada ręczek studenta', unit: '', min: 0, max: 1, step: 1 },
};

export function ScenarioEditor({ scenario, onSave, onCancel }: ScenarioEditorProps) {
  const [formData, setFormData] = useState<Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>>(
    scenario
      ? {
          name: scenario.name,
          description: scenario.description,
          difficulty: scenario.difficulty,
          estimatedDuration: scenario.estimatedDuration,
          initialSettings: { ...scenario.initialSettings },
          initialResistance: scenario.initialResistance,
          initialCompliance: scenario.initialCompliance,
          initialPatientParams: { ...(scenario.initialPatientParams || DEFAULT_PATIENT_PARAMS) },
          blocks: [...scenario.blocks],
        }
      : { ...DEFAULT_SCENARIO, blocks: [], initialPatientParams: { ...DEFAULT_PATIENT_PARAMS } }
  );

  // Track which blocks have their patient params section expanded
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  const handleNumberInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    onChange: (num: number) => void
  ) => {
    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
    e.target.value = cleaned;
    onChange(parseFloat(cleaned) || 0);
  };

  const handleOptionalNumberInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    onChange: (num: number | undefined) => void
  ) => {
    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
    e.target.value = cleaned;
    onChange(cleaned ? parseFloat(cleaned) : undefined);
  };

  useEffect(() => {
    if (scenario) {
      setFormData({
        name: scenario.name,
        description: scenario.description,
        difficulty: scenario.difficulty,
        estimatedDuration: scenario.estimatedDuration,
        initialSettings: { ...scenario.initialSettings },
        initialResistance: scenario.initialResistance,
        initialCompliance: scenario.initialCompliance,
        initialPatientParams: { ...(scenario.initialPatientParams || DEFAULT_PATIENT_PARAMS) },
        blocks: [...scenario.blocks],
      });
    } else {
      setFormData({ ...DEFAULT_SCENARIO, blocks: [], initialPatientParams: { ...DEFAULT_PATIENT_PARAMS } });
    }
  }, [scenario]);

  const applyDiseaseTemplate = (templateKey: string) => {
    const templates: Record<string, { r: number; c: number; params: PatientParams }> = {
      IDEAL: {
        r: 12,
        c: 40,
        params: {
          rin: 1,
          rout: 8,
          p01: 2,
          Tcykl: 3.0,
          PTi: 1.0,
          PriorityPR: 0,
          PressureRaiseT: 0,
          DoubleTriggeringTime: 0,
          knobDisable: false,
        }
      },
      COPD: {
        r: 25,
        c: 80,
        params: {
          rin: 2,
          rout: 18,
          p01: 4.0,
          Tcykl: 5.0,
          PTi: 1.2,
          PriorityPR: 0,
          PressureRaiseT: 0,
          DoubleTriggeringTime: 0,
          knobDisable: false,
        }
      },
      ARDS: {
        r: 8,
        c: 15,
        params: {
          rin: 1,
          rout: 5,
          p01: 5.0,
          Tcykl: 2.0,
          PTi: 0.7,
          PriorityPR: 0,
          PressureRaiseT: 0,
          DoubleTriggeringTime: 0,
          knobDisable: false,
        }
      },
      NEURO: {
        r: 10,
        c: 50,
        params: {
          rin: 1,
          rout: 6,
          p01: 0.5,
          Tcykl: 4.0,
          PTi: 1.0,
          PriorityPR: 0,
          PressureRaiseT: 0,
          DoubleTriggeringTime: 0,
          knobDisable: false,
        }
      }
    };

    const selected = templates[templateKey];
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        initialResistance: selected.r,
        initialCompliance: selected.c,
        initialPatientParams: {
          ...prev.initialPatientParams,
          ...selected.params,
        }
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addBlock = () => {
    const newBlock: ScenarioBlock = {
      id: `block-${Date.now()}`,
      type: 'NORMAL',
      startTime: formData.blocks.length * 60,
      duration: 60,
      description: '',
      parameterChanges: {},
    };
    setFormData({
      ...formData,
      blocks: [...formData.blocks, newBlock],
    });
  };

  const updateBlock = (index: number, updates: Partial<ScenarioBlock>) => {
    const newBlocks = [...formData.blocks];
    newBlocks[index] = { ...newBlocks[index], ...updates };
    setFormData({ ...formData, blocks: newBlocks });
  };

  const removeBlock = (index: number) => {
    setFormData({
      ...formData,
      blocks: formData.blocks.filter((_, i) => i !== index),
    });
    const newExpanded = new Set(expandedBlocks);
    newExpanded.delete(index);
    setExpandedBlocks(newExpanded);
  };

  const toggleBlockExpanded = (index: number) => {
    const newExpanded = new Set(expandedBlocks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedBlocks(newExpanded);
  };

  const updatePatientParam = (key: keyof PatientParams, value: number | boolean) => {
    setFormData({
      ...formData,
      initialPatientParams: {
        ...formData.initialPatientParams,
        [key]: value,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Basic Information ───────────────────────────── */}
      <div className="admin-card p-6">
        <h3 className="text-lg font-semibold text-admin-text mb-4">Informacje podstawowe</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="admin-label">Nazwa scenariusza</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="admin-input"
              placeholder="Wprowadź nazwę scenariusza"
              required
            />
          </div>

          <div className="col-span-2">
            <label className="admin-label">Opis</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="admin-input min-h-[80px]"
              placeholder="Opisz cel i przebieg scenariusza"
            />
          </div>

          <div>
            <label className="admin-label">Poziom trudności</label>
            <select
              value={formData.difficulty}
              onChange={(e) =>
                setFormData({ ...formData, difficulty: e.target.value as Scenario['difficulty'] })
              }
              className="admin-input"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="admin-label">Szacowany czas trwania (sekundy)</label>
            <input
              type="number"
              value={formData.estimatedDuration}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({ ...formData, estimatedDuration: Math.round(val) })
                )
              }
              className="admin-input"
              min="60"
              step="any"
            />
          </div>
        </div>
      </div>

      {/* ── Initial Ventilator Settings ─────────────────── */}
      <div className="admin-card p-6">
        <h3 className="text-lg font-semibold text-admin-text mb-4">Parametry początkowe respiratora</h3>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="admin-label">Tryb</label>
            <select
              value={formData.initialSettings.mode}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    mode: e.target.value as VentilatorMode,
                  },
                })
              }
              className="admin-input"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="admin-label">IPAP (cmH₂O)</label>
            <input
              type="number"
              value={formData.initialSettings.ipap}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialSettings: {
                      ...formData.initialSettings,
                      ipap: Math.round(val),
                    },
                  })
                )
              }
              className="admin-input"
              min="5"
              max="40"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">PEEP (cmH₂O)</label>
            <input
              type="number"
              value={formData.initialSettings.peep}
              onChange={(e) =>
                handleNumberInput(e, (val) => {
                  const intVal = Math.round(val);
                  setFormData({
                    ...formData,
                    initialSettings: {
                      ...formData.initialSettings,
                      peep: intVal,
                      epap: intVal,
                    },
                  });
                })
              }
              className="admin-input"
              min="0"
              max="20"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">RR (/min)</label>
            <input
              type="number"
              value={formData.initialSettings.rr}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialSettings: {
                      ...formData.initialSettings,
                      rr: Math.round(val),
                    },
                  })
                )
              }
              className="admin-input"
              min="6"
              max="40"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">Ti (s)</label>
            <input
              type="number"
              value={formData.initialSettings.ti}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialSettings: {
                      ...formData.initialSettings,
                      ti: val,
                    },
                  })
                )
              }
              className="admin-input"
              min="0.3"
              max="3"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">Trigger (cmH₂O)</label>
            <input
              type="number"
              value={formData.initialSettings.trigger}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialSettings: {
                      ...formData.initialSettings,
                      trigger: val,
                    },
                  })
                )
              }
              className="admin-input"
              min="1"
              max="10"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">Opór (R)</label>
            <input
              type="number"
              value={formData.initialResistance}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialResistance: Math.round(val),
                  })
                )
              }
              className="admin-input"
              min="1"
              max="50"
              step="any"
            />
          </div>

          <div>
            <label className="admin-label">Podatność (C)</label>
            <input
              type="number"
              value={formData.initialCompliance}
              onChange={(e) =>
                handleNumberInput(e, (val) =>
                  setFormData({
                    ...formData,
                    initialCompliance: Math.round(val),
                  })
                )
              }
              className="admin-input"
              min="10"
              max="100"
              step="any"
            />
          </div>
        </div>
      </div>

      {/* ── Initial Patient Parameters ──────────────────── */}
      <div className="admin-card p-6">
        <h3 className="text-lg font-semibold text-admin-text mb-2">Parametry początkowe pacjenta</h3>
        <p className="text-admin-muted text-sm mb-5">
          Parametry fizjologiczne pacjenta wpływające na symulację oddychania (model ILSim).
        </p>

        {/* Clinical presets select block */}
        <div className="bg-admin-surface rounded-xl p-4 mb-6 border border-admin-border select-none">
          <label className="admin-label font-semibold text-admin-accent flex items-center gap-1.5 mb-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Szablon kliniczny pacjenta (Choroba)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div className="md:col-span-2">
              <select
                onChange={(e) => applyDiseaseTemplate(e.target.value)}
                className="admin-input bg-admin-bg font-semibold text-sm border-admin-border"
                defaultValue=""
              >
                <option value="" disabled>Użyj gotowego szablonu...</option>
                <option value="IDEAL">Zdrowe płuca (Idealne parametry do wykresów)</option>
                <option value="COPD">POChP / Astma (Obstrukcja: wysoki opór i podatność)</option>
                <option value="ARDS">ARDS / Zapalenie płuc (Restrykcja: bardzo sztywne płuca)</option>
                <option value="NEURO">Osłabienie mięśniowe (Słaby wysiłek własny pacjenta)</option>
              </select>
            </div>
            <p className="md:col-span-2 text-xs text-admin-muted leading-relaxed">
              Wybór szablonu automatycznie uzupełni opór (R), podatność (C) oraz szczegółowe parametry ILSim odpowiednimi wartościami klinicznymi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(PATIENT_PARAM_LABELS) as Array<keyof PatientParams>).map((key) => {
            const config = PATIENT_PARAM_LABELS[key];

            if (key === 'knobDisable') {
              return (
                <div key={key} className="flex items-center gap-3 col-span-3">
                  <input
                    type="checkbox"
                    checked={!!formData.initialPatientParams.knobDisable}
                    onChange={(e) => updatePatientParam('knobDisable', e.target.checked)}
                    className="w-4 h-4 rounded border-admin-border"
                    id="initial-knobDisable"
                  />
                  <label htmlFor="initial-knobDisable" className="admin-label mb-0 cursor-pointer">
                    {config.label}
                  </label>
                </div>
              );
            }

            return (
              <div key={key}>
                <label className="admin-label">
                  {config.label} {config.unit && <span className="text-admin-muted font-normal">({config.unit})</span>}
                </label>
                <input
                  type="number"
                  value={formData.initialPatientParams[key] as number}
                  onChange={(e) => handleNumberInput(e, (val) => updatePatientParam(key, val))}
                  className="admin-input"
                  min={config.min}
                  max={config.max}
                  step="any"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scenario Blocks ─────────────────────────────── */}
      <div className="admin-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-admin-text">Bloki scenariusza</h3>
          <button type="button" onClick={addBlock} className="admin-btn admin-btn-primary admin-btn-sm">
            Dodaj blok
          </button>
        </div>

        {formData.blocks.length === 0 ? (
          <div className="py-8 text-center text-admin-muted">
            Brak bloków. Dodaj blok, aby zdefiniować przebieg scenariusza.
          </div>
        ) : (
          <div className="space-y-4">
            {formData.blocks.map((block, index) => (
              <div key={block.id} className="border border-admin-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-admin-text">Blok {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    className="text-admin-muted hover:text-admin-danger"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-3">
                  <div>
                    <label className="admin-label">Typ</label>
                    <select
                      value={block.type}
                      onChange={(e) =>
                        updateBlock(index, { type: e.target.value as 'NORMAL' | 'ASYNCHRONY' })
                      }
                      className="admin-input"
                    >
                      <option value="NORMAL">Normalny</option>
                      <option value="ASYNCHRONY">Asynchronia</option>
                    </select>
                  </div>

                  <div>
                    <label className="admin-label">Start (s)</label>
                    <input
                      type="number"
                      value={block.startTime}
                      onChange={(e) =>
                        handleNumberInput(e, (val) =>
                          updateBlock(index, { startTime: Math.round(val) })
                        )
                      }
                      className="admin-input"
                      min="0"
                      step="any"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Czas trwania (s)</label>
                    <input
                      type="number"
                      value={block.duration}
                      onChange={(e) =>
                        handleNumberInput(e, (val) =>
                          updateBlock(index, { duration: Math.round(val) })
                        )
                      }
                      className="admin-input"
                      min="10"
                      step="any"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Opór (R) opcjonalnie</label>
                    <input
                      type="number"
                      value={block.resistance ?? ''}
                      onChange={(e) =>
                        handleOptionalNumberInput(e, (val) =>
                          updateBlock(index, { resistance: val !== undefined ? Math.round(val) : undefined })
                        )
                      }
                      className="admin-input"
                      min="1"
                      max="50"
                      step="any"
                      placeholder="bez zmian"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Podatność (C) opcjonalnie</label>
                    <input
                      type="number"
                      value={block.compliance ?? ''}
                      onChange={(e) =>
                        handleOptionalNumberInput(e, (val) =>
                          updateBlock(index, { compliance: val !== undefined ? Math.round(val) : undefined })
                        )
                      }
                      className="admin-input"
                      min="10"
                      max="100"
                      step="any"
                      placeholder="bez zmian"
                    />
                  </div>

                  {block.type === 'ASYNCHRONY' && (
                    <div>
                      <label className="admin-label">Typ asynchronii</label>
                      <select
                        value={block.asynchronyType || ''}
                        onChange={(e) =>
                          updateBlock(index, { asynchronyType: e.target.value as AsynchronyType })
                        }
                        className="admin-input"
                      >
                        <option value="">Wybierz...</option>
                        {ASYNCHRONY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {ASYNCHRONY_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="col-span-6">
                    <label className="admin-label">Opis bloku</label>
                    <input
                      type="text"
                      value={block.description}
                      onChange={(e) => updateBlock(index, { description: e.target.value })}
                      className="admin-input"
                      placeholder="Opcjonalny opis"
                    />
                  </div>
                </div>

                {/* ── Block Patient Parameters (collapsible) ── */}
                <div className="mt-3 border-t border-admin-border pt-3">
                  <button
                    type="button"
                    onClick={() => toggleBlockExpanded(index)}
                    className="text-sm font-medium text-admin-accent hover:text-admin-accent/80 flex items-center gap-1"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${expandedBlocks.has(index) ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Parametry pacjenta (opcjonalnie)
                  </button>

                  {expandedBlocks.has(index) && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      {(Object.keys(PATIENT_PARAM_LABELS) as Array<keyof PatientParams>).map((key) => {
                        const config = PATIENT_PARAM_LABELS[key];

                        if (key === 'knobDisable') {
                          return (
                            <div key={key} className="flex items-center gap-3 col-span-3">
                              <input
                                type="checkbox"
                                checked={!!block.knobDisable}
                                onChange={(e) => updateBlock(index, { knobDisable: e.target.checked })}
                                className="w-4 h-4 rounded border-admin-border"
                                id={`block-${index}-knobDisable`}
                              />
                              <label htmlFor={`block-${index}-knobDisable`} className="admin-label mb-0 cursor-pointer text-sm">
                                {config.label}
                              </label>
                            </div>
                          );
                        }

                        return (
                          <div key={key}>
                            <label className="admin-label text-xs">
                              {config.label}
                            </label>
                            <input
                              type="number"
                              value={(block as any)[key] ?? ''}
                              onChange={(e) =>
                                handleOptionalNumberInput(e, (val) =>
                                  updateBlock(index, { [key]: val } as any)
                                )
                              }
                              className="admin-input"
                              min={config.min}
                              max={config.max}
                              step="any"
                              placeholder="bez zmian"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="admin-btn admin-btn-secondary">
          Anuluj
        </button>
        <button type="submit" className="admin-btn admin-btn-primary">
          {scenario ? 'Zapisz zmiany' : 'Utwórz scenariusz'}
        </button>
      </div>
    </form>
  );
}

export default ScenarioEditor;
