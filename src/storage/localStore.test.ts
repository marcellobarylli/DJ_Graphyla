import { describe, expect, it } from 'vitest';
import { DEFAULT_CRATE_NAME } from '../domain/crates';
import { addSong, createEmptyGraph } from '../domain/graph';
import { exportJson } from '../domain/serialize';
import { INDEX_KEY, LEGACY_KEY, crateKey, deleteCrateData, loadCrate, loadIndex, saveCrate, saveIndex } from './localStore';

const NOW = '2026-01-01T00:00:00.000Z';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const quiet = <T>(fn: () => T): T => {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
};

describe('crate storage', () => {
  it('creates one empty crate on first run', () => {
    const store = memoryStore();
    const index = loadIndex(store);
    expect(index.crates).toHaveLength(1);
    expect(index.crates[0]).toMatchObject({ name: DEFAULT_CRATE_NAME, songs: 0 });
    expect(index.activeId).toBe(index.crates[0]!.id);
    expect(loadCrate(index.activeId, store)).toEqual(createEmptyGraph());
    expect(store.data.has(INDEX_KEY)).toBe(true);
  });

  it('moves the pre-crates library into the first crate', () => {
    const store = memoryStore();
    const legacy = addSong(createEmptyGraph(), { title: 'Alpha' }, { id: 'a', now: NOW }).graph;
    store.setItem(LEGACY_KEY, exportJson(legacy));
    const index = loadIndex(store);
    expect(index.crates[0]).toMatchObject({ name: DEFAULT_CRATE_NAME, songs: 1 });
    expect(loadCrate(index.activeId, store)).toEqual(legacy);
    expect(store.data.has(LEGACY_KEY)).toBe(false);
  });

  it('returns the saved index on later runs', () => {
    const store = memoryStore();
    const first = loadIndex(store);
    expect(loadIndex(store)).toEqual(first);
  });

  it('falls back to the first crate if the active id is unknown', () => {
    const store = memoryStore();
    const index = loadIndex(store);
    saveIndex({ ...index, activeId: 'gone' }, store);
    expect(loadIndex(store).activeId).toBe(index.crates[0]!.id);
  });

  it('saves, loads and deletes crate data', () => {
    const store = memoryStore();
    const g = addSong(createEmptyGraph(), { title: 'Alpha' }, { id: 'a', now: NOW }).graph;
    saveCrate('c1', g, store);
    expect(loadCrate('c1', store)).toEqual(g);
    deleteCrateData('c1', store);
    expect(store.data.has(crateKey('c1'))).toBe(false);
  });

  it('keeps a copy of unreadable crate data and starts fresh', () => {
    const store = memoryStore();
    store.setItem(crateKey('c1'), '{broken');
    expect(quiet(() => loadCrate('c1', store))).toEqual(createEmptyGraph());
    expect([...store.data.keys()].some((k) => k.startsWith(`${crateKey('c1')}:corrupt:`))).toBe(true);
  });
});
