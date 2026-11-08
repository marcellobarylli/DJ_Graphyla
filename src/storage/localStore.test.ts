import { describe, expect, it } from 'vitest';
import { addSong, createEmptyGraph } from '../domain/graph';
import { STORAGE_KEY, loadGraph, saveGraph } from './localStore';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('localStore', () => {
  it('returns an empty graph when nothing is saved', () => {
    expect(loadGraph(memoryStore())).toEqual(createEmptyGraph());
  });

  it('saves and loads the graph', () => {
    const store = memoryStore();
    const g = addSong(createEmptyGraph(), { title: 'Alpha' }, { id: 'a', now: '2026-01-01T00:00:00.000Z' }).graph;
    saveGraph(g, store);
    expect(loadGraph(store)).toEqual(g);
  });

  it('keeps a copy of unreadable data and starts fresh', () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, '{broken');
    const original = console.error;
    console.error = () => {};
    try {
      expect(loadGraph(store)).toEqual(createEmptyGraph());
    } finally {
      console.error = original;
    }
    expect([...store.data.keys()].some((k) => k.startsWith(`${STORAGE_KEY}:corrupt:`))).toBe(true);
  });
});
