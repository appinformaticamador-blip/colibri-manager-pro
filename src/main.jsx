import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
