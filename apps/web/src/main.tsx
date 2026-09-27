import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prefetchSamples } from '@sw/module-progression';
import App from './shell/App';
import { initShellSettings } from './shell/settings';
import './global.css';

initShellSettings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Download the instrument samples straight away, so the first chord tapped plays them, not the
// synthesized fallback (see the "Fix first chord..." commit this ports forward).
setTimeout(prefetchSamples, 0);

// Offline support: a small service worker in production builds (it needs https or localhost).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the app simply works online only.
    });
  });
}
