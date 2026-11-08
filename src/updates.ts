/**
 * Notices when a newer version has been deployed while the app is open
 * (a home-screen app can be resumed from the background without reloading).
 * Checks version.json when the app comes to the foreground and every 30 minutes.
 */
export const UPDATE_EVENT = 'app:update-available';

let announced = false;

async function check(): Promise<void> {
  if (announced || !navigator.onLine) return;
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __BUILD_ID__) {
      announced = true;
      window.dispatchEvent(new Event(UPDATE_EVENT));
    }
  } catch {
    /* offline or blocked: try again later */
  }
}

export function watchForUpdates(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('online', () => void check());
  setInterval(() => void check(), 30 * 60 * 1000);
  void check();
}
