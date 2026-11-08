import { describe, expect, it } from 'vitest';
import { addSong, addTransition, createEmptyGraph, updateSong } from './graph';
import { ImportError, exportJson, mergeGraphs, parseBackup } from './serialize';

const NOW = '2026-01-01T00:00:00.000Z';

function sample() {
  let g = createEmptyGraph();
  g = addSong(g, { title: 'Alpha', bpm: 124 }, { id: 'a', now: NOW }).graph;
  g = addSong(g, { title: 'Bravo' }, { id: 'b', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromTime: 90, rating: 4 }, { id: 't', now: NOW }).graph;
  return g;
}

describe('backup round trip', () => {
  it('exports and re-imports an identical graph', () => {
    const g = sample();
    expect(parseBackup(exportJson(g, NOW))).toEqual(g);
  });

  it('writes a recognisable file header', () => {
    const file = JSON.parse(exportJson(sample(), NOW));
    expect(file).toMatchObject({ app: 'dj-graphyla', schemaVersion: 1, exportedAt: NOW });
    expect(file.songs).toHaveLength(2);
    expect(file.transitions).toHaveLength(1);
  });
});

describe('parseBackup', () => {
  it('rejects non-JSON and unrelated JSON', () => {
    expect(() => parseBackup('not json')).toThrow(ImportError);
    expect(() => parseBackup('[1,2]')).toThrow(/backup/);
    expect(() => parseBackup('{"foo":1}')).toThrow(/backup/);
  });

  it('rejects files from a newer schema', () => {
    expect(() => parseBackup('{"schemaVersion": 99, "songs": [], "transitions": []}')).toThrow(/newer/);
  });

  it('rejects dangling transitions', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      songs: [{ id: 'a', title: 'A' }],
      transitions: [{ id: 't', fromSongId: 'a', toSongId: 'missing' }],
    });
    expect(() => parseBackup(text)).toThrow(/not in the file/);
  });

  it('fills defaults for missing optional fields and drops invalid ratings', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      songs: [{ id: 'a', title: 'A', bpm: '124' }],
      transitions: [{ id: 't', fromSongId: 'a', toSongId: 'a', rating: 9 }],
    });
    const g = parseBackup(text, NOW);
    expect(g.songs.a).toEqual({ id: 'a', title: 'A', artist: '', bpm: null, key: '', tags: [], notes: '', createdAt: NOW, updatedAt: NOW });
    expect(g.transitions.t!.rating).toBeNull();
  });
});

describe('mergeGraphs', () => {
  it('adds new records and keeps the newer version of shared ones', () => {
    const base = sample();
    let other = updateSong(sample(), 'a', { bpm: 125 }, '2026-03-01T00:00:00.000Z');
    other = addSong(other, { title: 'Charlie' }, { id: 'c', now: NOW }).graph;
    const { graph, added, updated } = mergeGraphs(base, other);
    expect(added).toEqual({ songs: 1, transitions: 0 });
    expect(updated).toEqual({ songs: 1, transitions: 0 });
    expect(graph.songs.a!.bpm).toBe(125);
    expect(graph.songs.c).toBeDefined();
    expect(base.songs.c).toBeUndefined();
  });

  it('never overwrites with an older version', () => {
    const newer = updateSong(sample(), 'a', { bpm: 130 }, '2026-05-01T00:00:00.000Z');
    const { graph, updated } = mergeGraphs(newer, sample());
    expect(graph.songs.a!.bpm).toBe(130);
    expect(updated.songs).toBe(0);
  });
});
