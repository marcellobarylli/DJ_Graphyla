import { describe, expect, it } from 'vitest';
import { addSong, addTransition, createEmptyGraph, updateSong } from './graph';
import { appendTransition, createSet } from './sets';
import { ImportError, exportJson, exportLibraryJson, mergeGraphs, parseBackup, parseBackupFile } from './serialize';

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

  it('round-trips sets', () => {
    let g = sample();
    g = createSet(g, { name: 'Warmup', startSongId: 'a' }, { id: 's', now: NOW }).graph;
    g = appendTransition(g, 's', 't', NOW);
    expect(parseBackup(exportJson(g, NOW))).toEqual(g);
  });

  it('writes a recognisable file header', () => {
    const file = JSON.parse(exportJson(sample(), NOW));
    expect(file).toMatchObject({ app: 'dj-graphyla', schemaVersion: 3, exportedAt: NOW });
    expect(file.crate).toBeUndefined();
    expect(file.songs).toHaveLength(2);
    expect(file.transitions).toHaveLength(1);
    expect(file.sets).toEqual([]);
  });
});

describe('crate and library files', () => {
  it('labels a crate backup with the crate name', () => {
    const text = exportJson(sample(), NOW, { id: 'c1', name: 'Techno' });
    expect(JSON.parse(text).crate).toEqual({ id: 'c1', name: 'Techno' });
    expect(parseBackupFile(text, NOW)).toEqual({ kind: 'crate', crate: { id: 'c1', name: 'Techno' }, graph: sample() });
  });

  it('reads an unlabelled (older) backup as a crate backup', () => {
    expect(parseBackupFile(exportJson(sample(), NOW), NOW)).toMatchObject({ kind: 'crate', crate: null });
  });

  it('round-trips a library backup with every crate', () => {
    const crates = [
      { id: 'c1', name: 'Techno', graph: sample() },
      { id: 'c2', name: 'House', graph: createEmptyGraph() },
    ];
    expect(parseBackupFile(exportLibraryJson(crates, NOW), NOW)).toEqual({ kind: 'library', crates });
  });

  it('refuses a library backup where one crate is expected', () => {
    expect(() => parseBackup(exportLibraryJson([], NOW))).toThrow(/all crates/);
  });

  it('names the crate when a library backup is broken', () => {
    const text = JSON.stringify({ app: 'dj-graphyla', kind: 'library', schemaVersion: 3, crates: [{ id: 'x', name: 'Disco', songs: 'no' }] });
    expect(() => parseBackupFile(text)).toThrow(/Disco/);
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

  it('reads schema 1 files (no bars, no sets)', () => {
    const text = JSON.stringify({
      app: 'dj-graphyla',
      schemaVersion: 1,
      songs: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
      transitions: [{ id: 't', fromSongId: 'a', toSongId: 'b', fromTime: 90 }],
    });
    const g = parseBackup(text, NOW);
    expect(g.schemaVersion).toBe(3);
    expect(g.sets).toEqual({});
    expect(g.transitions.t).toMatchObject({ fromBar: null, toBar: null, fromTime: 90, overlapBars: null });
  });

  it('repairs sets whose references no longer resolve', () => {
    const text = JSON.stringify({
      schemaVersion: 2,
      songs: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
      transitions: [{ id: 't', fromSongId: 'a', toSongId: 'b' }],
      sets: [
        { id: 's1', name: 'Broken link', songIds: ['b', 'a'], transitionIds: ['t'] },
        { id: 's2', name: '', songIds: ['a', 'ghost', 'b'], transitionIds: ['t', null] },
      ],
    });
    const g = parseBackup(text, NOW);
    expect(g.sets.s1).toMatchObject({ songIds: ['b', 'a'], transitionIds: [null] });
    expect(g.sets.s2).toMatchObject({ name: 'Untitled set', songIds: ['a', 'b'], transitionIds: [null] });
  });

  it('reads overlap and drops invalid values', () => {
    const text = JSON.stringify({
      schemaVersion: 3,
      songs: [{ id: 'a', title: 'A' }],
      transitions: [
        { id: 't1', fromSongId: 'a', toSongId: 'a', overlapBars: 16 },
        { id: 't2', fromSongId: 'a', toSongId: 'a', overlapBars: 2.5 },
        { id: 't3', fromSongId: 'a', toSongId: 'a', overlapBars: 9999 },
      ],
    });
    const g = parseBackup(text, NOW);
    expect([g.transitions.t1!.overlapBars, g.transitions.t2!.overlapBars, g.transitions.t3!.overlapBars]).toEqual([16, null, null]);
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
    expect(added).toEqual({ songs: 1, transitions: 0, sets: 0 });
    expect(updated).toEqual({ songs: 1, transitions: 0, sets: 0 });
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
