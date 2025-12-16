import { Scenario, DIFFICULTY_LABELS, DIFFICULTY_COLORS, ASYNCHRONY_LABELS } from '../../types/trainer';

interface ScenarioListProps {
  scenarios: Scenario[];
  selectedId: string | null;
  onSelect: (scenario: Scenario) => void;
  onDelete?: (scenarioId: string) => void;
}

export function ScenarioList({ scenarios, selectedId, onSelect, onDelete }: ScenarioListProps) {
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const getAsynchronyTypes = (scenario: Scenario): string[] => {
    const types = new Set<string>();
    scenario.blocks.forEach((block) => {
      if (block.type === 'ASYNCHRONY' && block.asynchronyType) {
        types.add(ASYNCHRONY_LABELS[block.asynchronyType]);
      }
    });
    return Array.from(types);
  };

  return (
    <div className="space-y-2">
      {scenarios.length === 0 ? (
        <div className="admin-card p-8 text-center text-admin-muted">
          Brak scenariuszy. Utwórz nowy scenariusz, aby rozpocząć.
        </div>
      ) : (
        scenarios.map((scenario) => {
          const asyncTypes = getAsynchronyTypes(scenario);

          return (
            <div
              key={scenario.id}
              onClick={() => onSelect(scenario)}
              className={`admin-card p-4 cursor-pointer transition-all duration-200 ${
                selectedId === scenario.id
                  ? 'ring-2 ring-admin-accent border-admin-accent'
                  : 'hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-admin-text">{scenario.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        DIFFICULTY_COLORS[scenario.difficulty]
                      }`}
                    >
                      {DIFFICULTY_LABELS[scenario.difficulty]}
                    </span>
                  </div>
                  <p className="text-sm text-admin-muted line-clamp-2 mb-2">
                    {scenario.description || 'Brak opisu'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-admin-muted">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {formatDuration(scenario.estimatedDuration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                        />
                      </svg>
                      {scenario.blocks.length} bloków
                    </span>
                  </div>
                  {asyncTypes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asyncTypes.map((type) => (
                        <span
                          key={type}
                          className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(scenario.id);
                    }}
                    className="p-1 text-admin-muted hover:text-admin-danger transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default ScenarioList;
