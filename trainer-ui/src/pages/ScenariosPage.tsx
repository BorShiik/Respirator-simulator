import { useState, useEffect } from 'react';
import { ScenarioList } from '../components/scenarios/ScenarioList';
import { ScenarioEditor } from '../components/scenarios/ScenarioEditor';
import { trainerApi } from '../api/trainerApi';
import { Scenario, DEFAULT_PATIENT_PARAMS } from '../types/trainer';

export function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    setIsLoading(true);
    try {
      const data = await trainerApi.getScenarios();
      setScenarios(data);
    } catch (error) {
      console.error('Failed to load scenarios:', error);
      setScenarios([
        {
          id: 'scenario-1',
          name: 'Basic Synchronization Training',
          description: 'Introduction to recognizing proper patient-ventilator synchronization. Beginner level scenario.',
          difficulty: 'EASY',
          estimatedDuration: 300,
          initialSettings: {
            ipap: 15, epap: 5, peep: 5, rr: 14, ti: 1.0, trigger: 2, vt: 500, pinsp: 15, mode: 'PC-CMV'
          },
          initialResistance: 10,
          initialCompliance: 50,
          initialPatientParams: { ...DEFAULT_PATIENT_PARAMS, p01: 2, Tcykl: 2.8 },
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 120, description: 'Initial Phase', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 120, duration: 60, description: 'Asynchrony Detection', parameterChanges: {}, asynchronyType: 'INEFFECTIVE_TRIGGER' },
            { id: 'b3', type: 'NORMAL', startTime: 180, duration: 120, description: 'Adjustment and Observation', parameterChanges: {} },
          ],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
        },
        {
          id: 'scenario-2',
          name: 'Ineffective Trigger - Advanced',
          description: 'Recognizing and eliminating ineffective triggering across various clinical conditions.',
          difficulty: 'MEDIUM',
          estimatedDuration: 600,
          initialSettings: {
            ipap: 18, epap: 6, peep: 6, rr: 16, ti: 1.2, trigger: 4, vt: 550, pinsp: 18, mode: 'PC-CMV'
          },
          initialResistance: 15,
          initialCompliance: 40,
          initialPatientParams: { ...DEFAULT_PATIENT_PARAMS, p01: 2, Tcykl: 2.0 },
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 60, description: 'Stabilization', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 60, duration: 120, description: 'Ineffective Trigger', parameterChanges: {}, asynchronyType: 'INEFFECTIVE_TRIGGER' },
            { id: 'b3', type: 'NORMAL', startTime: 180, duration: 60, description: 'Break', parameterChanges: {} },
            { id: 'b4', type: 'ASYNCHRONY', startTime: 240, duration: 120, description: 'Double Triggering', parameterChanges: {}, asynchronyType: 'DOUBLE_TRIGGER' },
          ],
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now() - 172800000,
        },
        {
          id: 'scenario-3',
          name: 'Cycling Problems',
          description: 'Training in recognizing premature and delayed ventilator cycling.',
          difficulty: 'HARD',
          estimatedDuration: 900,
          initialSettings: {
            ipap: 20, epap: 8, peep: 8, rr: 18, ti: 1.0, trigger: 3, vt: 480, pinsp: 20, mode: 'PSV'
          },
          initialResistance: 20,
          initialCompliance: 35,
          initialPatientParams: { ...DEFAULT_PATIENT_PARAMS, p01: 2, Tcykl: 2.0 },
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 60, description: 'Calibration', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 60, duration: 180, description: 'Delayed Cycling', parameterChanges: {}, asynchronyType: 'DELAYED_CYCLING' },
            { id: 'b3', type: 'ASYNCHRONY', startTime: 240, duration: 180, description: 'Premature Cycling', parameterChanges: {}, asynchronyType: 'PREMATURE_CYCLING' },
          ],
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now() - 259200000,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedScenario(null);
    setIsEditing(true);
  };

  const handleSelect = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setIsEditing(true);
  };

  const handleSave = async (scenarioData: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (selectedScenario) {
        const updated = await trainerApi.updateScenario(selectedScenario.id, scenarioData);
        setScenarios(scenarios.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await trainerApi.createScenario(scenarioData);
        setScenarios([...scenarios, created]);
      }
    } catch (error) {
      console.error('Failed to save scenario:', error);
      const newScenario: Scenario = {
        id: `scenario-${Date.now()}`,
        ...scenarioData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (selectedScenario) {
        setScenarios(scenarios.map(s => s.id === selectedScenario.id ? { ...newScenario, id: selectedScenario.id } : s));
      } else {
        setScenarios([...scenarios, newScenario]);
      }
    }
    setIsEditing(false);
    setSelectedScenario(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedScenario(null);
  };

  const handleDelete = async (scenarioId: string) => {
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    
    try {
      await trainerApi.deleteScenario(scenarioId);
    } catch (error) {
      console.error('Failed to delete scenario:', error);
    }
    setScenarios(scenarios.filter(s => s.id !== scenarioId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-admin-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Scenarios</h1>
          <p className="text-admin-muted mt-1">
            {isEditing
              ? selectedScenario
                ? 'Edit scenario'
                : 'New scenario'
              : 'Manage training scenarios'}
          </p>
        </div>
        {!isEditing && (
          <button onClick={handleCreateNew} className="admin-btn admin-btn-primary">
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New scenario
          </button>
        )}
      </div>

      {isEditing ? (
        <ScenarioEditor
          scenario={selectedScenario}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <ScenarioList
          scenarios={scenarios}
          selectedId={selectedScenario?.id || null}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

export default ScenariosPage;
