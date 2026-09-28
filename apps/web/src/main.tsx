import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prefetchSamples } from '@sw/module-progression';
import App from './shell/App';
import { initShellSettings, useShellSettings } from './shell/settings';
import './global.css';

initShellSettings();

// Test hook, exactly like each module's own (@sw/module-progression, @sw/module-guitar): lets
// browser checks drive the shell-wide theme (PLAN.md §7 Phase 9: check:a11y across both themes).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __shell: unknown }).__shell = { store: useShellSettings };
}

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
