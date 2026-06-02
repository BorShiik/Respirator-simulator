import React from 'react';
import ReactDOM from 'react-dom/client';
import RespiratorScene from './RespiratorScene';

const rootElement = document.getElementById('react-respirator-root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RespiratorScene />
    </React.StrictMode>
  );
} else {
  console.error("Could not find element #react-respirator-root to mount React 3D respirator showcase!");
}
