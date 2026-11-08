import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphProvider } from './state/store';
import { App } from './ui/App';
import { watchForUpdates } from './updates';
import './styles.css';

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
