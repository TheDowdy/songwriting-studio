import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from './audio/engine';
import App from './App';
import { useStore } from './state/store';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Test hook: lets browser tests inspect the audio engine (dev builds, or add ?debug to the URL).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __fluidfrets: unknown }).__fluidfrets = { audioEngine, store: useStore };
}

// Offline support: a small service worker in production builds (it needs https or localhost).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the app simply works online only.
    });
  });
}
