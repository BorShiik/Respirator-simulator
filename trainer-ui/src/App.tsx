import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TrainerLayout } from './components/layout/TrainerLayout';
import { DashboardPage } from './pages/DashboardPage';
import { StationDetailsPage } from './pages/StationDetailsPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

function App() {
  return (
    <BrowserRouter>
      <TrainerLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/stations/:stationId" element={<StationDetailsPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/analytics/:traineeId" element={<AnalyticsPage />} />
        </Routes>
      </TrainerLayout>
    </BrowserRouter>
  );
}

export default App;
