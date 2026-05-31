import {
  Station,
  Scenario,
  Session,
  SessionDetails,
  CommandType,
  CommandResponse,
  AssignScenarioRequest,
  Room,
} from '../types/trainer';

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.includes('localhost') && window.location.hostname !== 'localhost') {
    return envUrl.replace('localhost', window.location.hostname);
  }
  return envUrl || `http://${window.location.hostname}:8081`;
}

const API_BASE_URL = getApiBaseUrl();

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
    throw new Error(`Błąd API: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

export async function getStations(): Promise<Station[]> {
  return fetchApi<Station[]>('/api/trainer/students');
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
  return fetchApi<CommandResponse>(`/api/trainer/students/${stationId}/assign`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sendCommand(stationId: string, command: CommandType): Promise<CommandResponse> {
  return fetchApi<CommandResponse>(`/api/trainer/students/${stationId}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}

export async function getStationSessions(stationId: string): Promise<Session[]> {
  return fetchApi<Session[]>(`/api/trainer/students/${stationId}/sessions`);
}

export async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
  return fetchApi<SessionDetails>(`/api/trainer/sessions/${sessionId}`);
}

export async function getTraineeSessions(traineeId: string): Promise<Session[]> {
  return fetchApi<Session[]>(`/api/trainer/trainees/${traineeId}/sessions`);
}

export async function getAllSessions(): Promise<Session[]> {
  return fetchApi<Session[]>('/api/trainer/sessions');
}

// Export analytics (per-student breakdown) to an .xlsx file and trigger download.
// Honours the currently selected room/student filters (omit or pass 'all' for everything).
export async function exportSessionsToExcel(
  filters: { roomId?: string; traineeId?: string } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.roomId && filters.roomId !== 'all') params.set('roomId', filters.roomId);
  if (filters.traineeId && filters.traineeId !== 'all') params.set('traineeId', filters.traineeId);
  const query = params.toString();

  const response = await fetch(
    `${API_BASE_URL}/api/trainer/sessions/export${query ? `?${query}` : ''}`,
  );
  if (!response.ok) {
    throw new Error(`Błąd eksportu: ${response.status}`);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analityka-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// === Rooms ===

export async function getRooms(): Promise<Room[]> {
  return fetchApi<Room[]>('/api/trainer/rooms');
}

export async function createRoom(name: string): Promise<Room> {
  return fetchApi<Room>('/api/trainer/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function closeRoom(roomId: string): Promise<Room> {
  return fetchApi<Room>(`/api/trainer/rooms/${roomId}/close`, {
    method: 'PATCH',
  });
}

export async function updatePatientParams(
  stationId: string,
  parameters: Record<string, number | boolean>,
): Promise<CommandResponse> {
  return fetchApi<CommandResponse>(`/api/trainer/students/${stationId}/patient`, {
    method: 'POST',
    body: JSON.stringify({ parameters }),
  });
}

export function getTrainerWebSocketUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsHost = import.meta.env.VITE_WS_HOST;
  if (wsHost && wsHost.includes('localhost') && window.location.hostname !== 'localhost') {
    wsHost = wsHost.replace('localhost', window.location.hostname);
  } else if (!wsHost) {
    wsHost = `${window.location.hostname}:8081`;
  }
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
  getAllSessions,
  exportSessionsToExcel,
  getRooms,
  createRoom,
  closeRoom,
  getTrainerWebSocketUrl,
  updatePatientParams,
  
  pauseStation: (stationId: string) => sendCommand(stationId, 'pause'),
  continueStation: (stationId: string) => sendCommand(stationId, 'continue'),
  resetStation: (stationId: string) => sendCommand(stationId, 'reset'),
};

export default trainerApi;

