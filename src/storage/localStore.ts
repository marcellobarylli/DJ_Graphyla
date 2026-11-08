/**
 * Local-first persistence: the whole graph lives in one localStorage entry.
 * Small libraries (thousands of songs) fit comfortably; a sync backend
 * can replace this module later without touching the domain layer.
 */
import { createEmptyGraph } from '../domain/graph';
import { exportJson, parseBackup } from '../domain/serialize';
import type { GraphData } from '../domain/types';

export const STORAGE_KEY = 'dj-graphyla:graph';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export function loadGraph(store: KeyValueStore = localStorage): GraphData {
  const text = store.getItem(STORAGE_KEY);
  if (!text) return createEmptyGraph();
  try {
    return parseBackup(text);
  } catch (err) {
    // Keep the unreadable payload so nothing is lost, then start fresh.
    store.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, text);
    console.error('Could not read saved graph, starting empty', err);
    return createEmptyGraph();
  }
}

export function saveGraph(graph: GraphData, store: KeyValueStore = localStorage): void {
  store.setItem(STORAGE_KEY, exportJson(graph));
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
