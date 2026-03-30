import { useState, useEffect } from 'react';
import {
  Scenario,
  ScenarioBlock,
  VentilatorMode,
  AsynchronyType,
  DEFAULT_SCENARIO,
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
          blocks: [...scenario.blocks],
        }
      : { ...DEFAULT_SCENARIO, blocks: [] }
  );

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
        blocks: [...scenario.blocks],
      });
    } else {
      setFormData({ ...DEFAULT_SCENARIO, blocks: [] });
    }
  }, [scenario]);

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
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
            <label className="admin-label">Szacowany czas (sekundy)</label>
            <input
              type="number"
              value={formData.estimatedDuration}
              onChange={(e) =>
                setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || 0 })
              }
              className="admin-input"
              min="60"
              step="60"
            />
          </div>
        </div>
      </div>

      <div className="admin-card p-6">
        <h3 className="text-lg font-semibold text-admin-text mb-4">Parametry początkowe</h3>

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
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    ipap: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="admin-input"
              min="5"
              max="40"
            />
          </div>

          <div>
            <label className="admin-label">PEEP (cmH₂O)</label>
            <input
              type="number"
              value={formData.initialSettings.peep}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    peep: parseInt(e.target.value) || 0,
                    epap: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="admin-input"
              min="0"
              max="20"
            />
          </div>

          <div>
            <label className="admin-label">RR (/min)</label>
            <input
              type="number"
              value={formData.initialSettings.rr}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    rr: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="admin-input"
              min="6"
              max="40"
            />
          </div>

          <div>
            <label className="admin-label">Ti (s)</label>
            <input
              type="number"
              value={formData.initialSettings.ti}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    ti: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="admin-input"
              min="0.3"
              max="3"
              step="0.1"
            />
          </div>

          <div>
            <label className="admin-label">Trigger (cmH₂O)</label>
            <input
              type="number"
              value={formData.initialSettings.trigger}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSettings: {
                    ...formData.initialSettings,
                    trigger: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="admin-input"
              min="1"
              max="10"
            />
          </div>

          <div>
            <label className="admin-label">Opór (R)</label>
            <input
              type="number"
              value={formData.initialResistance}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialResistance: parseInt(e.target.value) || 0,
                })
              }
              className="admin-input"
              min="1"
              max="50"
            />
          </div>

          <div>
            <label className="admin-label">Podatność (C)</label>
            <input
              type="number"
              value={formData.initialCompliance}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialCompliance: parseInt(e.target.value) || 0,
                })
              }
              className="admin-input"
              min="10"
              max="100"
            />
          </div>
        </div>
      </div>

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
                        updateBlock(index, { startTime: parseInt(e.target.value) || 0 })
                      }
                      className="admin-input"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Czas trwania (s)</label>
                    <input
                      type="number"
                      value={block.duration}
                      onChange={(e) =>
                        updateBlock(index, { duration: parseInt(e.target.value) || 0 })
                      }
                      className="admin-input"
                      min="10"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Opór (R) opcjonalnie</label>
                    <input
                      type="number"
                      value={block.resistance || ''}
                      onChange={(e) =>
                        updateBlock(index, { resistance: e.target.value ? parseInt(e.target.value) : undefined })
                      }
                      className="admin-input"
                      min="1"
                      max="50"
                      placeholder="bez zmian"
                    />
                  </div>

                  <div>
                    <label className="admin-label">Podatność (C) opcjonalnie</label>
                    <input
                      type="number"
                      value={block.compliance || ''}
                      onChange={(e) =>
                        updateBlock(index, { compliance: e.target.value ? parseInt(e.target.value) : undefined })
                      }
                      className="admin-input"
                      min="10"
                      max="100"
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
