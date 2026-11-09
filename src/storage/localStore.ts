/**
 * Local-first persistence.
 *
 * Layout in localStorage:
 *   dj-graphyla:crates        the crate index (names, counts, active crate)
 *   dj-graphyla:crate:<id>    one crate's songs, transitions and sets
 *
 * Crates are stored separately (like vaults), so only the active one is
 * loaded. A sync backend can replace this module later without touching
 * the domain layer.
 */
import { DEFAULT_CRATE_NAME, createIndex, newCrateMeta, type CrateId, type CrateIndex, type CrateMeta } from '../domain/crates';
import { createEmptyGraph } from '../domain/graph';
import { exportJson, parseBackup } from '../domain/serialize';
import type { GraphData } from '../domain/types';

export const INDEX_KEY = 'dj-graphyla:crates';
/** Single-library key used before crates existed (v0.1–v0.2). */
export const LEGACY_KEY = 'dj-graphyla:graph';
export const crateKey = (id: CrateId) => `dj-graphyla:crate:${id}`;

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readGraph(store: KeyValueStore, key: string): GraphData {
  const text = store.getItem(key);
  if (!text) return createEmptyGraph();
  try {
    return parseBackup(text);
  } catch (err) {
    // Keep the unreadable payload so nothing is lost, then start fresh.
    store.setItem(`${key}:corrupt:${Date.now()}`, text);
    console.error(`Could not read ${key}, starting empty`, err);
    return createEmptyGraph();
  }
}

function isMeta(v: unknown): v is CrateMeta {
  const m = v as CrateMeta;
  return !!m && typeof m.id === 'string' && typeof m.name === 'string';
}

function readIndex(store: KeyValueStore): CrateIndex | null {
  const text = store.getItem(INDEX_KEY);
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<CrateIndex>;
    const crates = Array.isArray(raw.crates) ? raw.crates.filter(isMeta) : [];
    if (crates.length === 0) return null;
    const activeId = crates.some((c) => c.id === raw.activeId) ? raw.activeId! : crates[0]!.id;
    return { version: 1, activeId, crates };
  } catch {
    return null;
  }
}

/**
 * Loads the crate index. On first run it creates one crate, moving the
 * pre-crates library (if any) into it.
 */
export function loadIndex(store: KeyValueStore = localStorage): CrateIndex {
  const existing = readIndex(store);
  if (existing) return existing;

  const legacy = store.getItem(LEGACY_KEY) ? readGraph(store, LEGACY_KEY) : createEmptyGraph();
  const first = newCrateMeta(DEFAULT_CRATE_NAME, { graph: legacy });
  saveCrate(first.id, legacy, store);
  const index = createIndex(first);
  saveIndex(index, store);
  store.removeItem(LEGACY_KEY);
  return index;
}

export function saveIndex(index: CrateIndex, store: KeyValueStore = localStorage): void {
  store.setItem(INDEX_KEY, JSON.stringify(index));
}

export function loadCrate(id: CrateId, store: KeyValueStore = localStorage): GraphData {
  return readGraph(store, crateKey(id));
}

export function saveCrate(id: CrateId, graph: GraphData, store: KeyValueStore = localStorage): void {
  store.setItem(crateKey(id), exportJson(graph));
}

export function deleteCrateData(id: CrateId, store: KeyValueStore = localStorage): void {
  store.removeItem(crateKey(id));
  store.removeItem(distinctKey(id));
}

/**
 * Song pairs the person marked “not the same” in a crate (see domain/dedupe.ts
 * pairKey), so they aren't suggested as duplicates again. Kept on this device.
 */
export const distinctKey = (id: CrateId) => `dj-graphyla:distinct:${id}`;

export function loadDistinct(id: CrateId, store: KeyValueStore = localStorage): Set<string> {
  try {
    const v = JSON.parse(store.getItem(distinctKey(id)) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveDistinct(id: CrateId, pairs: ReadonlySet<string>, store: KeyValueStore = localStorage): void {
  try {
    store.setItem(distinctKey(id), JSON.stringify([...pairs]));
  } catch {
    /* not remembered: the pair may be suggested again */
  }
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
