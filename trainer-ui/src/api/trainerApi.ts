import {
  Station,
  Scenario,
  Session,
  SessionDetails,
  CommandType,
  CommandResponse,
  AssignScenarioRequest,
} from '../types/trainer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

export async function getStations(): Promise<Station[]> {
  return fetchApi<Station[]>('/api/trainer/stations');
}

export async function getScenarios(): Promise<Scenario[]> {
  return fetchApi<Scenario[]>('/api/trainer/scenarios');
}

export async function getScenario(scenarioId: string): Promise<Scenario> {
  return fetchApi<Scenario>(`/api/trainer/scenarios/${scenarioId}`);
}

export async function createScenario(scenario: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>): Promise<Scenario> {
  return fetchApi<Scenario>('/api/trainer/scenarios', {
    method: 'POST',
    body: JSON.stringify(scenario),
  });
}

export async function updateScenario(scenarioId: string, scenario: Partial<Scenario>): Promise<Scenario> {
  return fetchApi<Scenario>(`/api/trainer/scenarios/${scenarioId}`, {
    method: 'PUT',
    body: JSON.stringify(scenario),
  });
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  await fetchApi<void>(`/api/trainer/scenarios/${scenarioId}`, {
    method: 'DELETE',
  });
}

export async function assignScenario(stationId: string, scenarioId: string): Promise<CommandResponse> {
  const body: AssignScenarioRequest = { scenarioId };
  return fetchApi<CommandResponse>(`/api/trainer/stations/${stationId}/assign`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sendCommand(stationId: string, command: CommandType): Promise<CommandResponse> {
  return fetchApi<CommandResponse>(`/api/trainer/stations/${stationId}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}

export async function getStationSessions(stationId: string): Promise<Session[]> {
  return fetchApi<Session[]>(`/api/trainer/stations/${stationId}/sessions`);
}

export async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
  return fetchApi<SessionDetails>(`/api/trainer/sessions/${sessionId}`);
}

export async function getTraineeSessions(traineeId: string): Promise<Session[]> {
  return fetchApi<Session[]>(`/api/trainer/trainees/${traineeId}/sessions`);
}

export function getTrainerWebSocketUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.VITE_WS_HOST || window.location.host;
  return `${wsProtocol}//${wsHost}/api/trainer/ws`;
}

export const trainerApi = {
  getStations,
  getScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
  assignScenario,
  sendCommand,
  getStationSessions,
  getSessionDetails,
  getTraineeSessions,
  getTrainerWebSocketUrl,
  
  startStation: (stationId: string) => sendCommand(stationId, 'start'),
  stopStation: (stationId: string) => sendCommand(stationId, 'stop'),
  resetStation: (stationId: string) => sendCommand(stationId, 'reset'),
};

export default trainerApi;
