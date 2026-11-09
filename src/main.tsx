import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphProvider } from './state/store';
import { initLookFont } from './state/lookFont';
import { initTheme } from './state/theme';
import { App } from './ui/App';
import { watchForUpdates } from './updates';
// Display fonts of the Y2K looks. Bundled for offline use; browsers download a
// face only when a look that uses it is on screen.
// SW4G 3R4: Anybody (width axis, for stretched type), Silkscreen (pixel), Pirata One (blackletter).
import '@fontsource-variable/anybody/wdth.css';
import '@fontsource-variable/anybody/wdth-italic.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pirata-one/latin-400.css';
// Y2K Futurism: Oxanium and Orbitron.
import '@fontsource-variable/oxanium/wght.css';
import '@fontsource-variable/orbitron/wght.css';
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
