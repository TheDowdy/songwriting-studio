import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { prefetchSamples } from './audio/engine';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Download the instrument samples straight away, so the first chord tapped plays them, not the fallback.
setTimeout(prefetchSamples, 0);
