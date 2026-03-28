import { useState, useEffect } from 'react';
import { ScenarioList } from '../components/scenarios/ScenarioList';
import { ScenarioEditor } from '../components/scenarios/ScenarioEditor';
import { trainerApi } from '../api/trainerApi';
import { Scenario } from '../types/trainer';

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
          name: 'Podstawowy trening synchronizacji',
          description: 'Wprowadzenie do rozpoznawania prawidłowej synchronizacji pacjent-respirator. Scenariusz dla początkujących.',
          difficulty: 'EASY',
          estimatedDuration: 300,
          initialSettings: {
            ipap: 15, epap: 5, peep: 5, rr: 14, ti: 1.0, trigger: 2, vt: 500, pinsp: 15, mode: 'PC-CMV'
          },
          initialResistance: 10,
          initialCompliance: 50,
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 120, description: 'Faza początkowa', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 120, duration: 60, description: 'Wykrycie asynchronii', parameterChanges: {}, asynchronyType: 'INEFFECTIVE_TRIGGER' },
            { id: 'b3', type: 'NORMAL', startTime: 180, duration: 120, description: 'Korekta i obserwacja', parameterChanges: {} },
          ],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
        },
        {
          id: 'scenario-2',
          name: 'Nieefektywny wyzwalacz - zaawansowany',
          description: 'Rozpoznawanie i eliminacja nieefektywnego wyzwalacza w różnych warunkach klinicznych.',
          difficulty: 'MEDIUM',
          estimatedDuration: 600,
          initialSettings: {
            ipap: 18, epap: 6, peep: 6, rr: 16, ti: 1.2, trigger: 4, vt: 550, pinsp: 18, mode: 'PC-CMV'
          },
          initialResistance: 15,
          initialCompliance: 40,
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 60, description: 'Stabilizacja', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 60, duration: 120, description: 'Nieefektywny trigger', parameterChanges: {}, asynchronyType: 'INEFFECTIVE_TRIGGER' },
            { id: 'b3', type: 'NORMAL', startTime: 180, duration: 60, description: 'Przerwa', parameterChanges: {} },
            { id: 'b4', type: 'ASYNCHRONY', startTime: 240, duration: 120, description: 'Podwójne wyzwalanie', parameterChanges: {}, asynchronyType: 'DOUBLE_TRIGGER' },
          ],
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now() - 172800000,
        },
        {
          id: 'scenario-3',
          name: 'Problemy z cyklicznością',
          description: 'Trening rozpoznawania przedwczesnej i opóźnionej cykliczności respiratora.',
          difficulty: 'HARD',
          estimatedDuration: 900,
          initialSettings: {
            ipap: 20, epap: 8, peep: 8, rr: 18, ti: 1.0, trigger: 3, vt: 480, pinsp: 20, mode: 'PSV'
          },
          initialResistance: 20,
          initialCompliance: 35,
          blocks: [
            { id: 'b1', type: 'NORMAL', startTime: 0, duration: 60, description: 'Kalibracja', parameterChanges: {} },
            { id: 'b2', type: 'ASYNCHRONY', startTime: 60, duration: 180, description: 'Opóźniona cykliczność', parameterChanges: {}, asynchronyType: 'DELAYED_CYCLING' },
            { id: 'b3', type: 'ASYNCHRONY', startTime: 240, duration: 180, description: 'Przedwczesna cykliczność', parameterChanges: {}, asynchronyType: 'PREMATURE_CYCLING' },
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
    if (!confirm('Czy na pewno chcesz usunąć ten scenariusz?')) return;
    
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
          <h1 className="text-2xl font-bold text-admin-text">Scenariusze</h1>
          <p className="text-admin-muted mt-1">
            {isEditing
              ? selectedScenario
                ? 'Edycja scenariusza'
                : 'Nowy scenariusz'
              : 'Zarządzaj scenariuszami treningowymi'}
          </p>
        </div>
        {!isEditing && (
          <button onClick={handleCreateNew} className="admin-btn admin-btn-primary">
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nowy scenariusz
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
