import { useState, useEffect } from 'react';
import { StudentLayout } from './components/layout/StudentLayout';
import { PressureChart } from './components/charts/PressureChart';
import { FlowChart } from './components/charts/FlowChart';
import { VolumeChart } from './components/charts/VolumeChart';
import { SettingsPanel, ParameterKey, PARAMETER_CONFIGS } from './components/panels/SettingsPanel';
import { StatusPanel } from './components/panels/StatusPanel';
import { useStudentWebSocket } from './hooks/useStudentWebSocket';
import { DEFAULT_SETTINGS, VentilatorSettings } from './types/student';

function StudentRegistration({ onRegister }: { onRegister: (studentName: string) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('studentName');
    if (stored) {
      setSavedName(stored);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (firstName.trim() && lastName.trim()) {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      localStorage.setItem('studentName', fullName);
      onRegister(fullName);
    }
  };

  const handleUseSaved = () => {
    if (savedName) {
      onRegister(savedName);
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

          <button
            type="submit"
            disabled={!firstName.trim() || !lastName.trim()}
            className="w-full control-button control-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rozpocznij symulację
          </button>
        </form>

        {savedName && (
          <div className="pt-4 border-t border-clinical-border mt-4">
            <p className="text-xs text-clinical-muted mb-2 text-center">
              Ostatnio zalogowany
            </p>
            <button
              type="button"
              onClick={handleUseSaved}
              className="w-full px-4 py-3 border border-clinical-accent text-clinical-accent rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              {savedName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MainScreen({ studentName, onLogout }: { studentName: string; onLogout: () => void }) {
  const [selectedParameter, setSelectedParameter] = useState<ParameterKey | null>(null);
  const [localSettings, setLocalSettings] = useState<VentilatorSettings>(DEFAULT_SETTINGS);
  
  const { telemetry, connectionStatus, isRegistered, logout } = useStudentWebSocket(studentName, localSettings);

  // Синхронизация с настройками от сервера (если не в mock режиме)
  useEffect(() => {
    if (telemetry?.settings && !import.meta.env.VITE_USE_MOCK) {
      setLocalSettings(telemetry.settings);
    }
  }, [telemetry?.settings]);

  // Обработка клавиш ↑↓ для изменения параметров
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedParameter) return;
      
      const config = PARAMETER_CONFIGS.find(c => c.key === selectedParameter);
      if (!config) return;
      
      let delta = 0;
      if (e.key === 'ArrowUp') {
        delta = config.step;
      } else if (e.key === 'ArrowDown') {
        delta = -config.step;
      } else if (e.key === 'Escape') {
        setSelectedParameter(null);
        return;
      } else {
        return;
      }
      
      e.preventDefault();
      
      setLocalSettings(prev => {
        const currentValue = prev[selectedParameter];
        const newValue = Math.min(config.max, Math.max(config.min, currentValue + delta));
        // Округляем до нужного количества знаков
        const roundedValue = Math.round(newValue * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);
        
        const newSettings = { ...prev, [selectedParameter]: roundedValue };
        
        // Синхронизируем связанные параметры
        if (selectedParameter === 'ipap') {
          newSettings.pinsp = roundedValue;
        } else if (selectedParameter === 'epap') {
          newSettings.peep = roundedValue;
        }
        
        return newSettings;
      });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedParameter]);

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
    <StudentLayout
      leftPanel={
        <SettingsPanel 
          settings={localSettings} 
          selectedParameter={selectedParameter}
          onParameterSelect={setSelectedParameter}
        />
      }
      centerTop={
        <PressureChart 
          data={pressure} 
          peep={localSettings.peep || localSettings.epap} 
          pip={localSettings.ipap || localSettings.pinsp} 
        />
      }
      centerMiddle={
        <FlowChart data={flow} />
      }
      centerBottom={
        <VolumeChart data={volume} targetVt={localSettings.vt} />
      }
      rightPanel={
        <StatusPanel
          scenarioName={scenarioName}
          asynchrony={asynchrony}
          studentName={studentName}
          connectionStatus={connectionStatus}
          isRegistered={isRegistered}
          onLogout={handleLogout}
        />
      }
    />
  );
}

function App() {
  const [studentName, setStudentName] = useState<string | null>(null);

  const handleLogout = () => {
    setStudentName(null);
  };

  if (!studentName) {
    return <StudentRegistration onRegister={setStudentName} />;
  }

  return <MainScreen studentName={studentName} onLogout={handleLogout} />;
}

export default App;
