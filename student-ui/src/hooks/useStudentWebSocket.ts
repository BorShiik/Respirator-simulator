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

// Состояние для отрисовки графика слева направо
let mockPhase = 0;
let mockPressureBuffer: (number | null)[] = [];
let mockFlowBuffer: (number | null)[] = [];
let mockVolumeBuffer: (number | null)[] = [];
let mockIsAsync = false;
let mockInitialized = false;
let mockCurrentIndex = 0; // Текущая позиция "карандаша" рисующего график

// Сценарий "Неэффективный триггер"
// Начальные настройки при которых возникает проблема
let mockScenarioActive = true; // Сценарий активен при запуске
let mockScenarioType: 'INEFFECTIVE_TRIGGER' | null = 'INEFFECTIVE_TRIGGER';
let mockScenarioInitialTrigger = 5.0; // Слишком высокий порог
let mockScenarioInitialIpap = 12; // Начальное IPAP

// Логика определения: исправил ли студент проблему
// Для "Неэффективный триггер": нужно понизить trigger ИЛИ понизить IPAP
function checkIfAsynchronyFixed(currentSettings: VentilatorSettings): boolean {
  if (!mockScenarioActive || !mockScenarioType) return true;
  
  if (mockScenarioType === 'INEFFECTIVE_TRIGGER') {
    // Студент исправил проблему если:
    // 1. Понизил порог триггера минимум на 1 cmH2O
    // 2. ИЛИ понизил IPAP минимум на 2 cmH2O
    const triggerReduced = currentSettings.trigger <= mockScenarioInitialTrigger - 1.0;
    const ipapReduced = currentSettings.ipap <= mockScenarioInitialIpap - 2;
    
    return triggerReduced || ipapReduced;
  }
  
  return true;
}

const BUFFER_SIZE = 200; // Меньше точек = крупнее графики на экране
const POINTS_PER_TICK = 1; // 1 точка за тик = реалистичная скорость

interface BreathParams {
  ipap: number;
  epap: number;
  ti: number;
  rr: number;
  vt: number;
  hasAsynchrony: boolean; // Флаг наличия асинхронии
  asynchronyType: string | null;
}

// Рассчитываем инкремент фазы в зависимости от RR
// При 100ms тиках = 10 точек/сек
// Цикл дыхания = 60/RR секунд
// Точек на цикл = 10 * (60/RR) = 600/RR
function getPhasePerPoint(rr: number): number {
  const pointsPerCycle = 600 / rr;
  return 1 / pointsPerCycle;
}

function calculateBreathValues(phase: number, params: BreathParams): { pressure: number; flow: number; volume: number } {
  const normalizedPhase = phase % 1;
  const cycleNumber = Math.floor(phase); // Номер текущего цикла дыхания
  
  // Рассчитываем соотношение вдоха к общему циклу
  const cycleDuration = 60 / params.rr; // секунды
  const inspirationRatio = Math.min(0.5, params.ti / cycleDuration);
  
  // Параметры из настроек
  const IPAP = params.ipap;
  const EPAP = params.epap;
  const TARGET_VT = params.vt;
  const PEAK_INSP_FLOW = 50; // L/min (фиксировано)
  const PEAK_EXP_FLOW = -40; // L/min (фиксировано)
  
  // Времена перехода (для плавности границ)
  const riseTime = 0.03;
  const fallTime = 0.03;
  
  let pressure: number;
  let flow: number;
  let volume: number;
  
  // При INEFFECTIVE_TRIGGER: каждый 3-й или 4-й вдох "пропускается"
  // Пациент пытается вдохнуть, но аппарат не реагирует
  const isFailedBreath = params.hasAsynchrony && 
    params.asynchronyType === 'INEFFECTIVE_TRIGGER' && 
    (cycleNumber % 3 === 2); // Каждый 3-й цикл — пропущенный
  
  if (isFailedBreath) {
    // ИСКАЖЁННЫЙ ВДОХ при неэффективном триггере
    // Пациент пытается вдохнуть → небольшое падение давления, но аппарат не даёт вдох
    if (normalizedPhase < 0.15) {
      // Попытка пациента вдохнуть — небольшое падение давления
      const t = normalizedPhase / 0.15;
      const patientEffort = Math.sin(t * Math.PI) * 2; // Усилие пациента
      pressure = EPAP - patientEffort; // Давление падает ниже EPAP
      flow = patientEffort * 3; // Слабый инспираторный поток
      volume = patientEffort * 10; // Минимальный объём
    } else {
      // Аппарат не среагировал — давление возвращается к EPAP
      pressure = EPAP + Math.random() * 0.3; // Небольшие флуктуации
      flow = (Math.random() - 0.5) * 2; // Почти ноль
      volume = 10 + Math.random() * 5; // Минимальный остаточный объём
    }
    
  } else {
    // НОРМАЛЬНЫЙ ВДОХ
    if (normalizedPhase < riseTime) {
      // Быстрый подъём давления (начало вдоха)
      const t = normalizedPhase / riseTime;
      pressure = EPAP + (IPAP - EPAP) * t;
      flow = PEAK_INSP_FLOW * t;
      volume = TARGET_VT * 0.05 * t;
      
    } else if (normalizedPhase < inspirationRatio - fallTime) {
      // Плато вдоха - прямоугольная волна давления
      const inspPhase = (normalizedPhase - riseTime) / (inspirationRatio - riseTime - fallTime);
      pressure = IPAP; // Плоское плато
      
      // Декрементный поток: высокий в начале, снижается к концу вдоха
      flow = PEAK_INSP_FLOW * (1 - inspPhase * 0.7);
      
      // Объём нарастает линейно
      volume = TARGET_VT * (0.05 + 0.95 * inspPhase);
      
    } else if (normalizedPhase < inspirationRatio) {
      // Переход от вдоха к выдоху
      const t = (normalizedPhase - (inspirationRatio - fallTime)) / fallTime;
      pressure = IPAP - (IPAP - EPAP) * t * 0.5;
      flow = PEAK_INSP_FLOW * 0.3 * (1 - t);
      volume = TARGET_VT;
      
    } else if (normalizedPhase < inspirationRatio + 0.05) {
      // Резкий переход к выдоху
      const t = (normalizedPhase - inspirationRatio) / 0.05;
      pressure = IPAP - (IPAP - EPAP) * (0.5 + 0.5 * t);
      flow = PEAK_EXP_FLOW * t;
      volume = TARGET_VT * (1 - 0.15 * t);
      
    } else {
      // Фаза выдоха - экспоненциальный спад
      const expPhase = (normalizedPhase - inspirationRatio - 0.05) / (1 - inspirationRatio - 0.05);
      
      // Давление: остаётся на уровне EPAP
      pressure = EPAP + (IPAP - EPAP) * 0.05 * Math.exp(-expPhase * 5);
      
      // Поток: отрицательный, затухающий к нулю
      flow = PEAK_EXP_FLOW * Math.exp(-expPhase * 3);
      
      // Объём: экспоненциальный спад к минимуму
      volume = TARGET_VT * 0.85 * Math.exp(-expPhase * 2.5) + TARGET_VT * 0.02;
    }
  }
  
  return { pressure, flow, volume };
}

function initializeMockBuffers() {
  // Начинаем с пустого буфера (все значения null)
  mockPressureBuffer = new Array(BUFFER_SIZE).fill(null);
  mockFlowBuffer = new Array(BUFFER_SIZE).fill(null);
  mockVolumeBuffer = new Array(BUFFER_SIZE).fill(null);
  mockPhase = 0;
  mockCurrentIndex = 0;
  mockInitialized = true;
}

function generateMockTelemetry(_prevTelemetry: TelemetryData | null, settings: VentilatorSettings): TelemetryData {
  const timestamp = Date.now();
  
  // Инициализация буферов при первом вызове
  if (!mockInitialized) {
    initializeMockBuffers();
  }
  
  // Проверяем: исправил ли студент проблему?
  const isFixed = checkIfAsynchronyFixed(settings);
  
  // Если студент исправил — выключаем асинхронию
  if (isFixed && mockScenarioActive) {
    mockIsAsync = false;
  } else if (mockScenarioActive && !isFixed) {
    // Сценарий активен и НЕ исправлен — асинхрония есть
    mockIsAsync = true;
  }
  
  // Параметры для расчёта волн
  const breathParams: BreathParams = {
    ipap: settings.ipap,
    epap: settings.epap,
    ti: settings.ti,
    rr: settings.rr,
    vt: settings.vt,
    hasAsynchrony: mockIsAsync,
    asynchronyType: mockIsAsync ? mockScenarioType : null,
  };
  
  // Инкремент фазы зависит от RR
  const phasePerPoint = getPhasePerPoint(settings.rr);
  
  // Рисуем слева направо: добавляем точки на текущую позицию
  for (let i = 0; i < POINTS_PER_TICK; i++) {
    // Вычисляем значение для текущей точки
    const values = calculateBreathValues(mockPhase, breathParams);
    
    // Записываем значение в текущую позицию
    mockPressureBuffer[mockCurrentIndex] = values.pressure;
    mockFlowBuffer[mockCurrentIndex] = values.flow;
    mockVolumeBuffer[mockCurrentIndex] = values.volume;
    
    // Увеличиваем фазу
    mockPhase += phasePerPoint;
    
    // Двигаем "карандаш" вправо
    mockCurrentIndex++;
    
    // Если дошли до конца — очищаем ВСЁ и начинаем сначала
    if (mockCurrentIndex >= BUFFER_SIZE) {
      // Полная очистка буфера — новый цикл начинается с чистого листа
      mockPressureBuffer = new Array(BUFFER_SIZE).fill(null);
      mockFlowBuffer = new Array(BUFFER_SIZE).fill(null);
      mockVolumeBuffer = new Array(BUFFER_SIZE).fill(null);
      mockCurrentIndex = 0;
    }
  }
  
  // Определяем название сценария
  const scenarioName = mockScenarioActive 
    ? (isFixed ? 'Nieefektywny wyzwalacz (NAPRAWIONY)' : 'Nieefektywny wyzwalacz')
    : 'Scenariusz podstawowy';
  
  return {
    timestamp,
    pressure: [...mockPressureBuffer] as number[],
    flow: [...mockFlowBuffer] as number[],
    volume: [...mockVolumeBuffer] as number[],
    settings: settings, // Передаём актуальные настройки
    asynchrony: {
      active: mockIsAsync,
      type: mockIsAsync ? mockScenarioType : null,
    },
    scenarioName: scenarioName,
  };
}

// Реальные буферы данных
let realPressureBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);
let realFlowBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);
let realVolumeBuffer: (number | null)[] = new Array(BUFFER_SIZE).fill(null);

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
              setError(message.message || 'Błąd serwera');
              break;
              
            case 'telemetry': {
              const pres = Array.isArray(message.pressure) ? message.pressure[0] : message.pressure;
              const flo = Array.isArray(message.flow) ? message.flow[0] : message.flow;
              const vol = Array.isArray(message.volume) ? message.volume[0] : message.volume;
              
              realPressureBuffer.push(pres);
              realFlowBuffer.push(flo);
              realVolumeBuffer.push(vol);
              
              if (realPressureBuffer.length > BUFFER_SIZE) {
                realPressureBuffer.shift();
                realFlowBuffer.shift();
                realVolumeBuffer.shift();
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
        setError('Błąd połączenia WebSocket');
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
