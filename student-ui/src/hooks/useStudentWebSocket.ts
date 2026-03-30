import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelemetryData,
  WebSocketMessage,
  ConnectionStatus,
  DEFAULT_SETTINGS,
  VentilatorSettings,
} from '../types/student';
import { getWebSocketUrl } from '../api/studentApi';

interface UseStudentWebSocketReturn {
  telemetry: TelemetryData | null;
  connectionStatus: ConnectionStatus;
  isRegistered: boolean;
  error: string | null;
  reconnect: () => void;
  logout: () => void;
  updateSettings: (settings: VentilatorSettings) => void;
  selectParameter: (param: string | null) => void;
  externalSelectedParameter: string | null;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

const BUFFER_SIZE = 200; // Buffer size for charts

let mockInitialized = false;
let mockPressureBuffer: (number | null)[] = [];
let mockFlowBuffer: (number | null)[] = [];
let mockVolumeBuffer: (number | null)[] = [];
let mockCurrentIndex = 0;

function initializeMockBuffers() {
  mockPressureBuffer = new Array(BUFFER_SIZE).fill(null);
  mockFlowBuffer = new Array(BUFFER_SIZE).fill(null);
  mockVolumeBuffer = new Array(BUFFER_SIZE).fill(null);
  mockCurrentIndex = 0;
  mockInitialized = true;
}

function generateMockTelemetry(_prevTelemetry: TelemetryData | null, settings: VentilatorSettings): TelemetryData {
  const timestamp = Date.now();
  
  if (!mockInitialized) {
    initializeMockBuffers();
  }
  
  // Mock: drawing flat lines. Real physics now lives in the backend.
  // Run the backend for full chart functionality.
  mockPressureBuffer[mockCurrentIndex] = settings.epap || 5;
  mockFlowBuffer[mockCurrentIndex] = 0;
  mockVolumeBuffer[mockCurrentIndex] = 0;
  
  mockCurrentIndex++;
  if (mockCurrentIndex >= BUFFER_SIZE) {
    initializeMockBuffers();
  }
  
  return {
    timestamp,
    pressure: [...mockPressureBuffer] as number[],
    flow: [...mockFlowBuffer] as number[],
    volume: [...mockVolumeBuffer] as number[],
    settings: settings,
    asynchrony: { active: false, type: null },
    scenarioName: 'MOCK MODE (No Physics)',
  };
}

// Real data buffers
let realPressureBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);
let realFlowBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);
let realVolumeBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);
let realCurrentIndex = 0;

export function useStudentWebSocket(studentName: string | null, externalSettings?: VentilatorSettings): UseStudentWebSocketReturn {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalSelectedParameter, setExternalSelectedParameter] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mockIntervalRef = useRef<number | null>(null);
  const studentNameRef = useRef<string | null>(studentName);
  const settingsRef = useRef<VentilatorSettings>(externalSettings || DEFAULT_SETTINGS);

  // Update refs when props change
  useEffect(() => {
    studentNameRef.current = studentName;
  }, [studentName]);

  useEffect(() => {
    if (externalSettings) {
      settingsRef.current = externalSettings;
    }
  }, [externalSettings]);

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
      setTelemetry(prev => generateMockTelemetry(prev, settingsRef.current));
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
              setError(message.message || 'Server error');
              break;
              
            case 'telemetry': {
              const pressures = Array.isArray(message.pressure) ? message.pressure : [message.pressure];
              const flows = Array.isArray(message.flow) ? message.flow : [message.flow];
              const volumes = Array.isArray(message.volume) ? message.volume : [message.volume];
              
              const pointsCount = Math.max(pressures.length, flows.length, volumes.length);

              // Adding points via "sweep" mechanics
              for (let i = 0; i < pointsCount; i++) {
                 realPressureBuffer[realCurrentIndex] = pressures[i] ?? null;
                 realFlowBuffer[realCurrentIndex] = flows[i] ?? null;
                 realVolumeBuffer[realCurrentIndex] = volumes[i] ?? null;
                 
                 realCurrentIndex++;
                 
                 // If reached the end — clear EVERYTHING and start over
                 if (realCurrentIndex >= BUFFER_SIZE) {
                    realPressureBuffer = new Array(BUFFER_SIZE).fill(null);
                    realFlowBuffer = new Array(BUFFER_SIZE).fill(null);
                    realVolumeBuffer = new Array(BUFFER_SIZE).fill(null);
                    realCurrentIndex = 0;
                 }
              }

              setTelemetry({
                timestamp: message.timestamp,
                pressure: [...realPressureBuffer] as number[],
                flow: [...realFlowBuffer] as number[],
                volume: [...realVolumeBuffer] as number[],
                settings: message.settings,
                asynchrony: message.asynchrony,
                scenarioName: message.scenarioName,
              });
              break;
            }
              
            case 'settingsUpdate':
              setTelemetry(prev => prev ? {
                ...prev,
                settings: message.settings,
              } : null);
              break;
              
            case 'parameterSelected':
              console.log('Backend selected parameter:', message.parameter);
              setExternalSelectedParameter(message.parameter);
              break;
          }
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return; // Prevent StrictMode cleanup loop
        
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
          setError('Maximum connection attempts exceeded');
          startMockMode();
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Could not create WebSocket connection');
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

  const updateSettings = useCallback((newSettings: VentilatorSettings) => {
    settingsRef.current = newSettings;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'settingsUpdate',
        settings: newSettings
      }));
    }
  }, []);

  const selectParameter = useCallback((param: string | null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'selectParameter',
        parameter: param
      }));
    }
  }, []);

  return {
    telemetry,
    connectionStatus,
    isRegistered,
    error,
    reconnect,
    logout,
    updateSettings,
    selectParameter,
    externalSelectedParameter,
  };
}

export default useStudentWebSocket;
