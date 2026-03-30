import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StationLiveStatus,
  TrainerWebSocketMessage,
  DEFAULT_SETTINGS,
} from '../types/trainer';
import { getTrainerWebSocketUrl } from '../api/trainerApi';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseTrainerWebSocketReturn {
  stationsMap: Map<string, StationLiveStatus>;
  connectionStatus: ConnectionStatus;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

function generateMockStations(): StationLiveStatus[] {
  const stations: StationLiveStatus[] = [];
  
  for (let i = 1; i <= 6; i++) {
    const isOnline = Math.random() > 0.2;
    const hasAsynchrony = isOnline && Math.random() > 0.6;
    
    stations.push({
      stationId: `station-${i.toString().padStart(2, '0')}`,
      status: isOnline ? 'online' : 'offline',
      settings: isOnline ? {
        ...DEFAULT_SETTINGS,
        ipap: 12 + Math.floor(Math.random() * 8),
        epap: 4 + Math.floor(Math.random() * 4),
        rr: 12 + Math.floor(Math.random() * 6),
      } : null,
      asynchrony: isOnline ? {
        active: hasAsynchrony,
        type: hasAsynchrony ? 'INEFFECTIVE_TRIGGER' : null,
      } : null,
      pressure: isOnline ? Array.from({ length: 20 }, () => 5 + Math.random() * 15) : [],
      flow: isOnline ? Array.from({ length: 20 }, () => -10 + Math.random() * 50) : [],
      volume: isOnline ? Array.from({ length: 20 }, () => Math.random() * 500) : [],
      scenarioName: isOnline ? 'Mock Scenario' : undefined,
      lastUpdate: Date.now(),
    });
  }
  
  return stations;
}

export function useTrainerWebSocket(): UseTrainerWebSocketReturn {
  const [stationsMap, setStationsMap] = useState<Map<string, StationLiveStatus>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mockIntervalRef = useRef<number | null>(null);
  const stationsMapRef = useRef<Map<string, StationLiveStatus>>(new Map());

  // Keep ref in sync
  useEffect(() => {
    stationsMapRef.current = stationsMap;
  }, [stationsMap]);

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
  }, []);

  const startMockMode = useCallback(() => {
    console.log('Starting mock trainer WebSocket mode');
    setConnectionStatus('connected');
    setError(null);
    
    const initialStations = generateMockStations();
    const initialMap = new Map<string, StationLiveStatus>();
    initialStations.forEach(s => initialMap.set(s.stationId, s));
    setStationsMap(initialMap);
    
    mockIntervalRef.current = window.setInterval(() => {
      setStationsMap(prev => {
        const newMap = new Map(prev);
        
        newMap.forEach((station, stationId) => {
          if (station.status === 'online' && Math.random() > 0.5) {
            const hasAsynchrony = Math.random() > 0.6;
            newMap.set(stationId, {
              ...station,
              asynchrony: {
                active: hasAsynchrony,
                type: hasAsynchrony ? 'INEFFECTIVE_TRIGGER' : null,
              },
              pressure: Array.from({ length: 20 }, () => 5 + Math.random() * 15),
              flow: Array.from({ length: 20 }, () => -10 + Math.random() * 50),
              volume: Array.from({ length: 20 }, () => Math.random() * 500),
              lastUpdate: Date.now(),
            });
          }
        });
        
        return newMap;
      });
    }, 2000);
  }, []);

  const connect = useCallback(() => {
    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';
    if (useMock) {
      startMockMode();
      return;
    }

    try {
      const url = getTrainerWebSocketUrl();
      console.log(`Connecting to Trainer WebSocket: ${url}`);
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Trainer WebSocket connected');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Register as a trainer to receive telemetry updates
        ws.send(JSON.stringify({ type: 'trainer_register' }));
      };

      ws.onmessage = (event) => {
        try {
          const message: TrainerWebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'stationsSnapshot' && message.stations) {
            const newMap = new Map<string, StationLiveStatus>();
            
            message.stations.forEach(s => {
              const existing = stationsMapRef.current.get(s.stationId);
              let pressureHistory = existing ? existing.pressure : [];
              let flowHistory = existing ? existing.flow : [];
              let volumeHistory = existing ? existing.volume : [];
              
              const newPressures = Array.isArray(s.pressure) ? s.pressure : [s.pressure];
              const validPressures = newPressures.filter(p => p !== undefined && p !== null) as number[];
              if (validPressures.length > 0) {
                pressureHistory = [...pressureHistory, ...validPressures].slice(-100);
              }

              const newFlows = Array.isArray(s.flow) ? s.flow : (s.flow !== undefined ? [s.flow] : []);
              const validFlows = newFlows.filter((f: number) => f !== undefined && f !== null) as number[];
              if (validFlows.length > 0) {
                flowHistory = [...flowHistory, ...validFlows].slice(-100);
              }

              const newVolumes = Array.isArray(s.volume) ? s.volume : (s.volume !== undefined ? [s.volume] : []);
              const validVolumes = newVolumes.filter((v: number) => v !== undefined && v !== null) as number[];
              if (validVolumes.length > 0) {
                volumeHistory = [...volumeHistory, ...validVolumes].slice(-100);
              }

              s.pressure = pressureHistory;
              s.flow = flowHistory;
              s.volume = volumeHistory;
              newMap.set(s.stationId, s);
            });
            
            setStationsMap(newMap);
          } else if (message.type === 'stationUpdate' && message.station) {
            setStationsMap(prev => {
              const newMap = new Map(prev);
              const s = message.station!;
              const existing = newMap.get(s.stationId);
              
              let pressureHistory = existing ? existing.pressure : [];
              let flowHistory = existing ? existing.flow : [];
              let volumeHistory = existing ? existing.volume : [];

              const newPressures = Array.isArray(s.pressure) ? s.pressure : [s.pressure];
              const validPressures = newPressures.filter(p => p !== undefined && p !== null) as number[];
              if (validPressures.length > 0) {
                pressureHistory = [...pressureHistory, ...validPressures].slice(-100);
              }

              const newFlows = Array.isArray(s.flow) ? s.flow : (s.flow !== undefined ? [s.flow] : []);
              const validFlows = newFlows.filter((f: number) => f !== undefined && f !== null) as number[];
              if (validFlows.length > 0) {
                flowHistory = [...flowHistory, ...validFlows].slice(-100);
              }

              const newVolumes = Array.isArray(s.volume) ? s.volume : (s.volume !== undefined ? [s.volume] : []);
              const validVolumes = newVolumes.filter((v: number) => v !== undefined && v !== null) as number[];
              if (validVolumes.length > 0) {
                volumeHistory = [...volumeHistory, ...validVolumes].slice(-100);
              }

              s.pressure = pressureHistory;
              s.flow = flowHistory;
              s.volume = volumeHistory;
              newMap.set(s.stationId, s);
              return newMap;
            });
          }
        } catch (parseError) {
          console.error('Failed to parse Trainer WebSocket message:', parseError);
        }
      };

      ws.onerror = (event) => {
        console.error('Trainer WebSocket error:', event);
        setError('WebSocket connection error');
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return; // Prevent cleanup reconnect loop
        console.log('Trainer WebSocket closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(`Reconnecting attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
          
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          setError('Maximum reconnection attempts exceeded');
          startMockMode();
        }
      };
    } catch (err) {
      console.error('Failed to create Trainer WebSocket:', err);
      setError('Cannot create WebSocket connection');
      setConnectionStatus('error');
      startMockMode();
    }
  }, [cleanup, startMockMode]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return {
    stationsMap,
    connectionStatus,
    error,
    reconnect,
  };
}

export default useTrainerWebSocket;
