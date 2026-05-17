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

function StudentRegistration({ 
  onRegister,
  error,
  isConnecting
}: { 
  onRegister: (studentName: string, roomCode: string) => void;
  error?: string | null;
  isConnecting?: boolean;
}) {
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
    if (firstName.trim() && lastName.trim() && roomCode.trim().length === 6 && !isConnecting) {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      localStorage.setItem('studentName', fullName);
      localStorage.setItem('roomCode', roomCode.trim());
      onRegister(fullName, roomCode.trim());
    }
  };

  const handleUseSaved = () => {
    if (savedName && roomCode.trim().length === 6 && !isConnecting) {
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

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm mb-6 text-center">
            {error}
          </div>
        )}

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
            disabled={!firstName.trim() || !lastName.trim() || roomCode.length !== 6 || isConnecting}
            className="w-full control-button control-button-primary disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {isConnecting ? (
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : null}
            {isConnecting ? 'Łączenie...' : 'Rozpocznij symulację'}
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
              disabled={roomCode.length !== 6 || isConnecting}
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

function MainScreen({ 
  studentName, 
  roomCode, 
  onLogout,
  onRegistered,
  onError,
  isRegisteredState
}: { 
  studentName: string; 
  roomCode: string; 
  onLogout: () => void;
  onRegistered: () => void;
  onError: (err: string) => void;
  isRegisteredState: boolean;
}) {
  const [selectedParameter, setSelectedParameter] = useState<ParameterKey | null>(null);
  const [localSettings, setLocalSettings] = useState<VentilatorSettings>(DEFAULT_SETTINGS);
  const { isDark, toggle: toggleTheme } = useTheme();
  
  const { telemetry, connectionStatus, trainerConnectionStatus, isRegistered, error, logout, updateSettings, selectParameter, externalSelectedParameter, simulationStatus, difficulty, patientParams } = useStudentWebSocket(studentName, roomCode, localSettings);

  useEffect(() => {
    if (isRegistered) {
      onRegistered();
    }
  }, [isRegistered, onRegistered]);

  // If there's an error during connection (e.g. invalid room code), show an alert and logout
  useEffect(() => {
    if (error) {
      onError(error);
      const isFatal = error === 'Nie znaleziono pokoju o podanym kodzie.' || error === 'Pokój został już zamknięty przez trenera.';
      if (isFatal) {
        if (isRegisteredState) {
          alert(error);
        }
        onLogout();
      }
    }
  }, [error, isRegisteredState, onLogout, onError]);

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

  if (!isRegisteredState) {
    return null;
  }

  return (
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
  );
}

function App() {
  const [studentInfo, setStudentInfo] = useState<{name: string, room: string} | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogout = () => {
    setStudentInfo(null);
    setIsRegistered(false);
  };

  return (
    <>
      {!isRegistered && (
        <StudentRegistration 
          onRegister={(name, room) => {
            setLoginError(null);
            setStudentInfo({name, room});
          }} 
          error={loginError}
          isConnecting={!!studentInfo && !isRegistered && !loginError}
        />
      )}
      {studentInfo && (
        <MainScreen 
          studentName={studentInfo.name} 
          roomCode={studentInfo.room} 
          onLogout={handleLogout}
          onRegistered={() => {
            setLoginError(null);
            setIsRegistered(true);
          }}
          onError={(err) => setLoginError(err)}
          isRegisteredState={isRegistered}
        />
      )}
    </>
  );
}

export default App;
