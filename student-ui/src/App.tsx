import { useState, useEffect, useCallback } from 'react';
import { StudentLayout } from './components/layout/StudentLayout';
import { PressureChart } from './components/charts/PressureChart';
import { FlowChart } from './components/charts/FlowChart';
import { VolumeChart } from './components/charts/VolumeChart';
import { SettingsPanel, ParameterKey, PARAMETER_CONFIGS } from './components/panels/SettingsPanel';
import { StatusPanel } from './components/panels/StatusPanel';
import { useStudentWebSocket } from './hooks/useStudentWebSocket';
import { DEFAULT_SETTINGS, VentilatorSettings } from './types/student';

// ─── Theme Hook ──────────────────────────────────────────────────
function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = useCallback(() => setIsDark(prev => !prev), []);

  return { isDark, toggle };
}

function StudentRegistration({ onRegister }: { onRegister: (studentName: string, roomCode: string) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('studentName');
    const storedRoom = localStorage.getItem('roomCode');
    if (stored) {
      setSavedName(stored);
    }
    if (storedRoom) {
      setRoomCode(storedRoom);
    }
  }, [onRegister]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (firstName.trim() && lastName.trim() && roomCode.trim().length === 6) {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      localStorage.setItem('studentName', fullName);
      localStorage.setItem('roomCode', roomCode.trim());
      onRegister(fullName, roomCode.trim());
    }
  };

  const handleUseSaved = () => {
    if (savedName && roomCode.trim().length === 6) {
      localStorage.setItem('roomCode', roomCode.trim());
      onRegister(savedName, roomCode.trim());
    }
  };

  return (
    <div className="min-h-screen bg-clinical-bg flex items-center justify-center">
      <div className="bg-clinical-panel rounded-2xl shadow-lg p-8 w-full max-w-md border border-clinical-border">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-clinical-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-clinical-text">
            Symulator Respiratora
          </h1>
          <p className="text-clinical-muted mt-2">
            Wprowadź swoje dane, aby rozpocząć
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-clinical-text mb-2">
              Imię
            </label>
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="np. Jan"
              className="w-full px-4 py-3 border border-clinical-border rounded-lg focus:ring-2 focus:ring-clinical-accent focus:border-clinical-accent outline-none transition-colors bg-white"
              required
            />
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-clinical-text mb-2">
              Nazwisko
            </label>
            <input
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="np. Kowalski"
              className="w-full px-4 py-3 border border-clinical-border rounded-lg focus:ring-2 focus:ring-clinical-accent focus:border-clinical-accent outline-none transition-colors bg-white"
              required
            />
          </div>

          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium text-clinical-text mb-2">
              Kod pokoju (6 cyfr)
            </label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="np. 123456"
              className="w-full px-4 py-3 border border-clinical-border rounded-lg focus:ring-2 focus:ring-clinical-accent focus:border-clinical-accent outline-none transition-colors bg-white text-center tracking-[0.5em] text-lg font-mono"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={!firstName.trim() || !lastName.trim() || roomCode.length !== 6}
            className="w-full control-button control-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rozpocznij symulację
          </button>
        </form>

        {savedName && (
          <div className="pt-4 border-t border-clinical-border mt-4">
            <p className="text-xs text-clinical-muted mb-2 text-center">
              Zaloguj jako ostatni użytkownik
            </p>
            <button
              type="button"
              onClick={handleUseSaved}
              disabled={roomCode.length !== 6}
              className="w-full px-4 py-3 border border-clinical-accent text-clinical-accent rounded-lg hover:bg-blue-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savedName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MainScreen({ studentName, roomCode, onLogout }: { studentName: string; roomCode: string; onLogout: () => void }) {
  const [selectedParameter, setSelectedParameter] = useState<ParameterKey | null>(null);
  const [localSettings, setLocalSettings] = useState<VentilatorSettings>(DEFAULT_SETTINGS);
  const { isDark, toggle: toggleTheme } = useTheme();
  
  const { telemetry, connectionStatus, trainerConnectionStatus, isRegistered, error, logout, updateSettings, selectParameter, externalSelectedParameter, simulationStatus, difficulty, patientParams } = useStudentWebSocket(studentName, roomCode, localSettings);

  // If there's an error during connection (e.g. invalid room code), show an alert and logout
  useEffect(() => {
    if (error === 'Invalid or inactive room code') {
      alert('Nieprawidłowy lub nieaktywny kod pokoju!');
      onLogout();
    }
  }, [error, onLogout]);

  // Синхронизация с настройками от сервера (если не в mock режиме)
  useEffect(() => {
    if (telemetry?.settings && !import.meta.env.VITE_USE_MOCK) {
      setLocalSettings(telemetry.settings);
    }
  }, [telemetry?.settings]);

  // Синхронизация фокуса с энкодером Raspberry Pi
  useEffect(() => {
    if (externalSelectedParameter !== undefined && !import.meta.env.VITE_USE_MOCK) {
      setSelectedParameter(externalSelectedParameter as ParameterKey | null);
    }
  }, [externalSelectedParameter]);

  // Обработка клавиш ↑↓ для изменения параметров
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedParameter || simulationStatus === 'paused') return;
      
      const config = PARAMETER_CONFIGS.find(c => c.key === selectedParameter);
      if (!config) return;
      
      let delta = 0;
      if (e.key === 'ArrowUp') {
        delta = config.step;
      } else if (e.key === 'ArrowDown') {
        delta = -config.step;
      } else if (e.key === 'Escape') {
        setSelectedParameter(null);
        selectParameter(null);
        return;
      } else {
        return;
      }
      
      e.preventDefault();
      
      const currentValue = localSettings[selectedParameter] as number;
      const newValue = Math.min(config.max, Math.max(config.min, currentValue + delta));
      // Округляем до нужного количества знаков
      const roundedValue = Math.round(newValue * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);
      
      const newSettings = { ...localSettings, [selectedParameter]: roundedValue };
      
      // Синхронизируем связанные параметры
      if (selectedParameter === 'ipap') {
        newSettings.pinsp = roundedValue;
      } else if (selectedParameter === 'epap') {
        newSettings.peep = roundedValue;
      }
      
      setLocalSettings(newSettings);
      updateSettings(newSettings);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedParameter, localSettings, updateSettings, selectParameter, simulationStatus]);

  const pressure = telemetry?.pressure || [];
  const flow = telemetry?.flow || [];
  const volume = telemetry?.volume || [];
  const asynchrony = telemetry?.asynchrony || { active: false, type: null };
  const scenarioName = telemetry?.scenarioName || '';

  const handleLogout = () => {
    logout();
    localStorage.removeItem('studentName');
    onLogout();
  };

  return (
    <>
      {simulationStatus === 'scenario_completed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-emerald-900/90 border border-emerald-500/50 rounded-2xl p-8 max-w-md text-center shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Scenariusz Ukończony!</h2>
            <p className="text-emerald-100 mb-6">Dobra robota! Trener otrzymał statystyki z Twojego zadania. Oczekuj na kolejne instrukcje.</p>
          </div>
        </div>
      )}
      <StudentLayout
        isDark={isDark}
      onToggleTheme={toggleTheme}
      leftPanel={
        <SettingsPanel 
          settings={localSettings} 
          selectedParameter={selectedParameter}
          onParameterSelect={(param) => {
            setSelectedParameter(param);
            selectParameter(param);
          }}
          isDisabled={simulationStatus === 'paused'}
          isDark={isDark}
        />
      }
      centerTop={
        <PressureChart 
          peep={localSettings.peep || localSettings.epap} 
          pip={localSettings.ipap || localSettings.pinsp}
          isDark={isDark}
        />
      }
      centerMiddle={
        <FlowChart isDark={isDark} />
      }
      centerBottom={
        <VolumeChart targetVt={localSettings.vt} isDark={isDark} />
      }
      rightPanel={
        <StatusPanel
          scenarioName={scenarioName}
          asynchrony={asynchrony}
          studentName={studentName}
          connectionStatus={connectionStatus}
          trainerConnectionStatus={trainerConnectionStatus}
          isRegistered={isRegistered}
          onLogout={handleLogout}
          simulationStatus={simulationStatus}
          difficulty={difficulty}
          patientParams={patientParams}
        />
      }
    />
    </>
  );
}

function App() {
  const [studentInfo, setStudentInfo] = useState<{name: string, room: string} | null>(null);

  const handleLogout = () => {
    setStudentInfo(null);
  };

  if (!studentInfo) {
    return <StudentRegistration onRegister={(name, room) => setStudentInfo({name, room})} />;
  }

  return <MainScreen studentName={studentInfo.name} roomCode={studentInfo.room} onLogout={handleLogout} />;
}

export default App;
