import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphProvider } from './state/store';
import { initLookFont } from './state/lookFont';
import { initTheme } from './state/theme';
import { App } from './ui/App';
import { watchForUpdates } from './updates';
// Display fonts of the Y2K looks. Bundled for offline use; browsers download a
// face only when a look that uses it is on screen.
import '@fontsource/jost/latin-800-italic.css';
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import './styles.css';

initTheme();
void initLookFont();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GraphProvider>
      <App />
    </GraphProvider>
  </StrictMode>,
);

// Offline support + "Add to Home Screen" install. Only in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .catch((err) => console.warn('Service worker registration failed', err));
    watchForUpdates();
    // Warm the lazily loaded graph view so the service worker caches it for offline use.
    setTimeout(() => void import('./ui/GraphView'), 4000);
  });
}
