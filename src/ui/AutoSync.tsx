import { useEffect, useRef } from 'react';
import { autoSync, startAutoSync } from '../state/autoSync';
import { useStore } from '../state/store';

/**
 * Runs the record shop auto-sync in the background (state/autoSync.ts).
 * Renders nothing: syncing never shows a screen or makes anything wait.
 */
export function AutoSync() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;

  useEffect(
    () =>
      startAutoSync({
        crates: () => ref.current.crates.map((c) => ({ id: c.id, name: c.name })),
        crateGraph: (id) => ref.current.crateGraph(id),
        updateCrate: (id, fn) => ref.current.updateCrate(id, fn),
      }),
    [],
  );

  // Every edit of the open crate restarts the quiet-time countdown before uploading.
  useEffect(() => {
    autoSync()?.changed(store.activeCrate.id);
  }, [store.graph, store.activeCrate.id]);

  return null;
}
