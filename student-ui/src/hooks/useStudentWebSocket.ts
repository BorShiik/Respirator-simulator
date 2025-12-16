import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelemetryData,
  WebSocketMessage,
  ConnectionStatus,
  DEFAULT_SETTINGS,
} from '../types/student';
import { getWebSocketUrl } from '../api/studentApi';

interface UseStudentWebSocketReturn {
  telemetry: TelemetryData | null;
  connectionStatus: ConnectionStatus;
  isRegistered: boolean;
  error: string | null;
  reconnect: () => void;
  logout: () => void;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

function generateMockTelemetry(prevTelemetry: TelemetryData | null): TelemetryData {
  const timestamp = Date.now();
  const baseTime = timestamp % 10000;
  
  const pressure: number[] = [];
  const flow: number[] = [];
  const volume: number[] = [];
  
  for (let i = 0; i < 100; i++) {
    const t = (baseTime + i * 50) % 4000;
    const phase = t / 4000;
    
    if (phase < 0.3) {
      pressure.push(5 + (15 * Math.sin(phase * Math.PI / 0.3)));
      flow.push(60 * Math.cos(phase * Math.PI / 0.6));
      volume.push(500 * phase / 0.3);
    } else {
      const expPhase = (phase - 0.3) / 0.7;
      pressure.push(5 + 15 * Math.exp(-expPhase * 3));
      flow.push(-40 * Math.exp(-expPhase * 2));
      volume.push(500 * (1 - expPhase));
    }
  }
  
  const isAsync = Math.random() > 0.7;
  
  return {
    timestamp,
    pressure,
    flow,
    volume,
    settings: prevTelemetry?.settings || DEFAULT_SETTINGS,
    asynchrony: {
      active: isAsync,
      type: isAsync ? 'INEFFECTIVE_TRIGGER' : null,
    },
    scenarioName: prevTelemetry?.scenarioName || 'Scenariusz podstawowy',
  };
}

export function useStudentWebSocket(studentName: string | null): UseStudentWebSocketReturn {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mockIntervalRef = useRef<number | null>(null);
  const studentNameRef = useRef<string | null>(studentName);

  // Update ref when studentName changes
  useEffect(() => {
    studentNameRef.current = studentName;
  }, [studentName]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (mockIntervalRef.current) {
      window.clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
    setIsRegistered(false);
  }, []);

  const startMockMode = useCallback(() => {
    console.log('Starting mock telemetry mode');
    setConnectionStatus('connected');
    setIsRegistered(true);
    setError(null);
    
    mockIntervalRef.current = window.setInterval(() => {
      setTelemetry(prev => generateMockTelemetry(prev));
    }, 100);
  }, []);

  const connect = useCallback(() => {
    if (!studentName) return;
    
    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';
    if (useMock) {
      startMockMode();
      return;
    }

    try {
      const url = getWebSocketUrl();
      console.log(`Connecting to WebSocket: ${url}`);
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected, registering student...');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Send registration message with student name
        ws.send(JSON.stringify({
          type: 'register',
          data: { studentName: studentNameRef.current }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'registered':
              console.log('Student registered:', message.studentName);
              setIsRegistered(true);
              break;
              
            case 'loggedOut':
              console.log('Student logged out');
              setIsRegistered(false);
              setTelemetry(null);
              break;
              
            case 'error':
              console.error('Server error:', message.message);
              setError(message.message || 'Błąd serwera');
              break;
              
            case 'telemetry':
              setTelemetry({
                timestamp: message.timestamp,
                pressure: message.pressure,
                flow: message.flow,
                volume: message.volume,
                settings: message.settings,
                asynchrony: message.asynchrony,
                scenarioName: message.scenarioName,
              });
              break;
              
            case 'settingsUpdate':
              setTelemetry(prev => prev ? {
                ...prev,
                settings: message.settings,
              } : null);
              break;
          }
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Błąd połączenia WebSocket');
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        setIsRegistered(false);
        
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(`Reconnecting attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
          
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          setError('Przekroczono maksymalną liczbę prób połączenia');
          startMockMode();
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Nie można utworzyć połączenia WebSocket');
      setConnectionStatus('error');
      startMockMode();
    }
  }, [studentName, cleanup, startMockMode]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  const logout = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'logout' }));
    }
    setIsRegistered(false);
    setTelemetry(null);
  }, []);

  useEffect(() => {
    if (studentName) {
      connect();
    }
    
    return cleanup;
  }, [studentName, connect, cleanup]);

  return {
    telemetry,
    connectionStatus,
    isRegistered,
    error,
    reconnect,
    logout,
  };
}

export default useStudentWebSocket;
