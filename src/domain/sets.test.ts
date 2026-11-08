import { describe, expect, it } from 'vitest';
import { GraphError, addSong, addTransition, createEmptyGraph, deleteSong, deleteTransition, updateTransition } from './graph';
import {
  appendGap,
  appendTransition,
  chooseStepTransition,
  createSet,
  deleteSet,
  removeSongFromSet,
  setStartSong,
  setToText,
  setsUsingSong,
  setsUsingTransition,
  tempoTrack,
  updateSetInfo,
  walkOf,
} from './sets';
import type { GraphData } from './types';

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

/** a → b (2 variants), b → c, c → a */
function fixture(): GraphData {
  let g = createEmptyGraph();
  g = addSong(g, { title: 'Alpha', bpm: 124 }, { id: 'a', now: NOW }).graph;
  g = addSong(g, { title: 'Bravo', bpm: 126 }, { id: 'b', now: NOW }).graph;
  g = addSong(g, { title: 'Charlie', bpm: 122 }, { id: 'c', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromBar: 97, toBar: 1, fromBpm: 124, toBpm: 124, rating: 4 }, { id: 'ab1', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromBar: 65, toBar: 17, fromBpm: 125, toBpm: 125, rating: 5 }, { id: 'ab2', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'b', toSongId: 'c', fromBar: 129, toBar: 1, fromBpm: 126, toBpm: 126, overlapBars: 16, notes: 'echo out' }, { id: 'bc', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'c', toSongId: 'a', fromBpm: 126, toBpm: 126 }, { id: 'ca', now: NOW }).graph;
  return g;
}

/** Walk a →(ab1) b →(bc) c */
function withSet(): GraphData {
  let g = createSet(fixture(), { name: 'Warmup', startSongId: 'a' }, { id: 's', now: NOW }).graph;
  g = appendTransition(g, 's', 'ab1', NOW);
  g = appendTransition(g, 's', 'bc', NOW);
  return g;
}

describe('building a set', () => {
  it('creates a set at a start song', () => {
    const { set } = createSet(fixture(), { name: '  Warmup ', startSongId: 'a' }, { id: 's', now: NOW });
    expect(set).toEqual({ id: 's', name: 'Warmup', notes: '', songIds: ['a'], transitionIds: [], createdAt: NOW, updatedAt: NOW });
  });

  it('can start empty and get a start song later', () => {
    let g = createSet(fixture(), { name: 'Later' }, { id: 's' }).graph;
    expect(g.sets.s!.songIds).toEqual([]);
    g = setStartSong(g, 's', 'b');
    expect(g.sets.s!.songIds).toEqual(['b']);
    expect(() => setStartSong(g, 's', 'a')).toThrow(GraphError);
  });

  it('walks along outgoing edges only', () => {
    const g = withSet();
    expect(g.sets.s).toMatchObject({ songIds: ['a', 'b', 'c'], transitionIds: ['ab1', 'bc'] });
    expect(() => appendTransition(g, 's', 'ab2')).toThrow(/last song/);
  });

  it('allows revisiting songs (a walk, not a path)', () => {
    let g = withSet();
    g = appendTransition(g, 's', 'ca');
    g = appendTransition(g, 's', 'ab2');
    expect(g.sets.s!.songIds).toEqual(['a', 'b', 'c', 'a', 'b']);
    expect(walkOf(g, g.sets.s!).steps.map((s) => s.repeat)).toEqual([false, false, false, true, true]);
  });

  it('adds a gap when jumping to an unconnected song', () => {
    const g = appendGap(withSet(), 's', 'b');
    expect(g.sets.s).toMatchObject({ songIds: ['a', 'b', 'c', 'b'], transitionIds: ['ab1', 'bc', null] });
    expect(walkOf(g, g.sets.s!).gaps).toBe(1);
  });

  it('switches between variants of the same step', () => {
    const g = chooseStepTransition(withSet(), 's', 0, 'ab2');
    expect(g.sets.s!.transitionIds).toEqual(['ab2', 'bc']);
    expect(() => chooseStepTransition(g, 's', 0, 'bc')).toThrow(/connect/);
    expect(chooseStepTransition(g, 's', 0, null).sets.s!.transitionIds).toEqual([null, 'bc']);
  });

  it('removes songs from the start, middle and end', () => {
    expect(removeSongFromSet(withSet(), 's', 0).sets.s).toMatchObject({ songIds: ['b', 'c'], transitionIds: ['bc'] });
    expect(removeSongFromSet(withSet(), 's', 2).sets.s).toMatchObject({ songIds: ['a', 'b'], transitionIds: ['ab1'] });
    expect(removeSongFromSet(withSet(), 's', 1).sets.s).toMatchObject({ songIds: ['a', 'c'], transitionIds: [null] });
  });

  it('renames and deletes sets', () => {
    let g = updateSetInfo(withSet(), 's', { name: 'Peak', notes: 'closing' }, LATER);
    expect(g.sets.s).toMatchObject({ name: 'Peak', notes: 'closing', updatedAt: LATER });
    g = deleteSet(g, 's');
    expect(g.sets).toEqual({});
    expect(Object.keys(g.songs)).toHaveLength(3);
  });
});

describe('sets follow changes in the graph', () => {
  it('deleting a transition leaves a gap in sets that used it', () => {
    const g = deleteTransition(withSet(), 'ab1', LATER);
    expect(g.sets.s).toMatchObject({ songIds: ['a', 'b', 'c'], transitionIds: [null, 'bc'], updatedAt: LATER });
  });

  it('re-pointing a transition leaves a gap in sets that used it', () => {
    const g = updateTransition(withSet(), 'bc', { toSongId: 'a' });
    expect(g.sets.s!.transitionIds).toEqual(['ab1', null]);
  });

  it('editing a transition without moving it keeps it in the set', () => {
    const g = updateTransition(withSet(), 'bc', { rating: 2 });
    expect(g.sets.s!.transitionIds).toEqual(['ab1', 'bc']);
  });

  it('deleting a song removes it from sets and joins its neighbours with a gap', () => {
    let g = appendTransition(withSet(), 's', 'ca');
    g = deleteSong(g, 'b');
    expect(g.sets.s).toMatchObject({ songIds: ['a', 'c', 'a'], transitionIds: [null, 'ca'] });
  });

  it('finds the sets that use a song or transition', () => {
    const g = withSet();
    expect(setsUsingSong(g, 'c').map((s) => s.id)).toEqual(['s']);
    expect(setsUsingTransition(g, 'ab2')).toEqual([]);
  });
});

describe('reading a set', () => {
  it('derives the tempo of every song from the edges around it', () => {
    const walk = walkOf(withSet(), withSet().sets.s!);
    expect(walk.startBpm).toBe(124);
    expect(walk.steps.map((s) => [s.enterBpm, s.leaveBpm, s.drift])).toEqual([
      [null, 124, null],
      [124, 126, 2],
      [126, null, null],
    ]);
    expect(walk.steps[0]!.link!.variants.map((t) => t.id)).toEqual(['ab2', 'ab1']);
    expect(walk.steps[2]!.link).toBeUndefined();
  });

  it('lists the tempo at every mix', () => {
    const g = withSet();
    expect(tempoTrack(g, g.sets.s!).map((p) => [p.mix, p.outBpm, p.inBpm])).toEqual([
      [1, 124, 124],
      [2, 126, 126],
    ]);
  });

  it('exports a readable setlist', () => {
    const g = appendGap(withSet(), 's', 'a');
    expect(setToText(g, g.sets.s!)).toBe(
      [
        'Warmup',
        'Starts at 124 BPM',
        '',
        '1. Alpha',
        '   ↳ out bar 97 @ 124 → in bar 1 @ 124  ★★★★',
        '2. Bravo',
        '   ↳ out bar 129 @ 126 → in bar 1 @ 126 · 16 bars  (echo out)',
        '3. Charlie',
        '   ↳ gap: no transition yet',
        '4. Alpha',
      ].join('\n'),
    );
  });
});
