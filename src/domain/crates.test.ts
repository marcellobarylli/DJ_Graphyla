import { describe, expect, it } from 'vitest';
import {
  activeCrate,
  addCrate,
  createIndex,
  newCrateMeta,
  removeCrate,
  renameCrate,
  setActiveCrate,
  sortedCrates,
  touchCrate,
} from './crates';
import { GraphError, addSong, createEmptyGraph } from './graph';

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

function twoCrates() {
  let index = createIndex(newCrateMeta('Techno', { id: 't', now: NOW }));
  index = addCrate(index, newCrateMeta('House', { id: 'h', now: NOW }));
  return index;
}

describe('crate index', () => {
  it('creates crate metadata with counts', () => {
    const g = addSong(createEmptyGraph(), { title: 'A' }).graph;
    expect(newCrateMeta('  Techno ', { id: 't', now: NOW, graph: g })).toEqual({
      id: 't', name: 'Techno', createdAt: NOW, updatedAt: NOW, songs: 1, transitions: 0, sets: 0,
    });
    expect(() => newCrateMeta('  ')).toThrow(GraphError);
  });

  it('adds crates without switching unless asked', () => {
    const index = twoCrates();
    expect(index.activeId).toBe('t');
    const next = addCrate(index, newCrateMeta('Disco', { id: 'd' }), { activate: true });
    expect(next.activeId).toBe('d');
    expect(() => addCrate(next, newCrateMeta('Again', { id: 'd' }))).toThrow(/exists/);
  });

  it('switches, renames and sorts', () => {
    let index = setActiveCrate(twoCrates(), 'h');
    expect(activeCrate(index).name).toBe('House');
    index = renameCrate(index, 'h', 'Deep house', LATER);
    expect(activeCrate(index)).toMatchObject({ name: 'Deep house', updatedAt: LATER });
    expect(sortedCrates(index).map((c) => c.name)).toEqual(['Deep house', 'Techno']);
    expect(() => setActiveCrate(index, 'nope')).toThrow(GraphError);
    expect(() => renameCrate(index, 'h', ' ')).toThrow(/name/);
  });

  it('removes crates, moving the active crate if needed, but never the last one', () => {
    const index = removeCrate(twoCrates(), 't');
    expect(index.crates.map((c) => c.id)).toEqual(['h']);
    expect(index.activeId).toBe('h');
    expect(() => removeCrate(index, 'h')).toThrow(/at least one/);
  });

  it('refreshes counts when a crate changes', () => {
    const g = addSong(createEmptyGraph(), { title: 'A' }).graph;
    const index = touchCrate(twoCrates(), 'h', g, LATER);
    expect(index.crates.find((c) => c.id === 'h')).toMatchObject({ songs: 1, updatedAt: LATER });
    expect(index.crates.find((c) => c.id === 't')).toMatchObject({ songs: 0, updatedAt: NOW });
  });
});
