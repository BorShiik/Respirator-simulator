import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelemetryData,
  WebSocketMessage,
  ConnectionStatus,
  DifficultyLevel,
  PatientParams,
  DEFAULT_SETTINGS,
  VentilatorSettings,
} from '../types/student';
import { getWebSocketUrl } from '../api/studentApi';
import { pushChartData, resetChartBuffers } from '../stores/chartBufferStore';

interface UseStudentWebSocketReturn {
  telemetry: TelemetryData | null;
  connectionStatus: ConnectionStatus;
  trainerConnectionStatus: boolean;
  isRegistered: boolean;
  error: string | null;
  reconnect: () => void;
  logout: () => void;
  updateSettings: (settings: VentilatorSettings) => void;
  selectParameter: (param: string | null) => void;
  externalSelectedParameter: string | null;
  simulationStatus: string | null;
  difficulty: DifficultyLevel;
  patientParams: PatientParams | null;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

const BUFFER_SIZE = 500; // Sliding window size (10 seconds at 50Hz)

// Sliding window buffers — new data pushed to end, old data dropped from front
let realPressureBuffer: number[] = [];
let realFlowBuffer: number[] = [];
let realVolumeBuffer: number[] = [];
let lastTelemetryStateUpdate = 0;

function resetRealBuffers() {
  resetChartBuffers();
}

function pushToBuffer(buffer: number[], values: number[]): number[] {
  const combined = buffer.concat(values);
  if (combined.length > BUFFER_SIZE) {
    return combined.slice(combined.length - BUFFER_SIZE);
  }
  return combined;
}

export function useStudentWebSocket(studentName: string | null, roomCode: string | null, externalSettings?: VentilatorSettings): UseStudentWebSocketReturn {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalSelectedParameter, setExternalSelectedParameter] = useState<string | null>(null);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('EASY');
  const [patientParams, setPatientParams] = useState<PatientParams | null>(null);
  const [trainerConnectionStatus, setTrainerConnectionStatus] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mockIntervalRef = useRef<number | null>(null);
  const studentNameRef = useRef<string | null>(studentName);
  const roomCodeRef = useRef<string | null>(roomCode);
  const settingsRef = useRef<VentilatorSettings>(externalSettings || DEFAULT_SETTINGS);

  // Update refs when props change
  useEffect(() => {
    studentNameRef.current = studentName;
    roomCodeRef.current = roomCode;
  }, [studentName, roomCode]);

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
      const val = settingsRef.current.epap || 5;
      realPressureBuffer = pushToBuffer(realPressureBuffer, [val]);
      realFlowBuffer = pushToBuffer(realFlowBuffer, [0]);
      realVolumeBuffer = pushToBuffer(realVolumeBuffer, [0]);

      setTelemetry({
        timestamp: Date.now(),
        pressure: [...realPressureBuffer],
        flow: [...realFlowBuffer],
        volume: [...realVolumeBuffer],
        settings: settingsRef.current,
        asynchrony: { active: false, type: null },
        scenarioName: 'MOCK MODE (No Physics)',
      });
    }, 100);
  }, []);

  const connect = useCallback(() => {
    if (!studentName || !roomCode) return;

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

        // Send registration message with student name and room code
        ws.send(JSON.stringify({
          type: 'register',
          data: { studentName: studentNameRef.current, roomCode: roomCodeRef.current }
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

            case 'status':
              // Reset chart buffers only on explicit reset
              if (message.status === 'reset') {
                resetRealBuffers();
                setSimulationStatus('running');
              } else {
                setSimulationStatus(message.status);
              }
              if (message.difficulty) {
                setDifficulty(message.difficulty);
              }
              if (message.patientParams) {
                setPatientParams(message.patientParams);
              }
              break;

            case 'telemetry': {
              const pressures = Array.isArray(message.pressure) ? message.pressure : [message.pressure];
              const flows = Array.isArray(message.flow) ? message.flow : [message.flow];
              const volumes = Array.isArray(message.volume) ? message.volume : [message.volume];

              // Write directly to shared store (Canvas reads this, NO React re-render)
              pushChartData(pressures, flows, volumes);

              // Throttle React state updates to ~2Hz (only for settings/asynchrony/scenario)
              const now = Date.now();
              if (now - lastTelemetryStateUpdate > 500) {
                lastTelemetryStateUpdate = now;
                setTelemetry({
                  timestamp: message.timestamp,
                  pressure: [],  // Empty — charts read from store directly
                  flow: [],
                  volume: [],
                  settings: message.settings,
                  asynchrony: message.asynchrony,
                  scenarioName: message.scenarioName,
                  difficulty: message.difficulty,
                });
              }
              // Also update difficulty from telemetry for continuous sync
              if (message.difficulty) {
                setDifficulty(message.difficulty);
              }
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

            case 'trainerStatus':
              console.log('Trainer connection status:', message.connected);
              setTrainerConnectionStatus(message.connected);
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

  const sendParameterSelect = useCallback((parameter: string | null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'parameterSelect', data: { parameter } }));
    }
  }, []);

  const acknowledgeEncoderButton = useCallback(() => {
    setEncoderButtonAction(null);
  }, []);

  return {
    telemetry,
    connectionStatus,
    trainerConnectionStatus,
    isRegistered,
    error,
    reconnect,
    logout,
    updateSettings,
    selectParameter,
    externalSelectedParameter,
    simulationStatus,
    difficulty,
    patientParams,
  };
}

export default useStudentWebSocket;
