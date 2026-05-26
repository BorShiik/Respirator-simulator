import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { TrainerWebSocketProvider } from './hooks/useTrainerWebSocket';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TrainerWebSocketProvider>
        <App />
      </TrainerWebSocketProvider>
    </ThemeProvider>
  </React.StrictMode>
);

