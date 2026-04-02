import { CommandRequest, CommandResponse, CommandType } from '../types/student';

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.includes('localhost') && window.location.hostname !== 'localhost') {
    return envUrl.replace('localhost', window.location.hostname);
  }
  const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
  return envUrl || `http://${host}:8080`;
}

const API_BASE_URL = getApiBaseUrl();

export async function sendCommand(studentName: string, command: CommandType): Promise<CommandResponse> {
  const url = `${API_BASE_URL}/api/students/${encodeURIComponent(studentName)}/command`;
  
  const requestBody: CommandRequest = { command };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Błąd serwera: ${response.status} - ${errorText}`,
      };
    }
    
    const data: CommandResponse = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Nieznany błąd';
    return {
      success: false,
      message: `Błąd połączenia: ${errorMessage}`,
    };
  }
}

export function getWebSocketUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsHost = import.meta.env.VITE_WS_HOST;
  if (wsHost && wsHost.includes('localhost') && window.location.hostname !== 'localhost') {
    wsHost = wsHost.replace('localhost', window.location.hostname);
  } else if (!wsHost) {
    const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    wsHost = `${host}:8080`;
  }
  return `${wsProtocol}//${wsHost}/api/stations/ws`;
}

export const studentApi = {
  sendCommand,
  getWebSocketUrl,
  
  start: (studentName: string) => sendCommand(studentName, 'start'),
  stop: (studentName: string) => sendCommand(studentName, 'stop'),
  reset: (studentName: string) => sendCommand(studentName, 'reset'),
};

export default studentApi;
