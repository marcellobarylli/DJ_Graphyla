import { describe, expect, it } from 'vitest';
import {
  GraphError,
  addSong,
  addTransition,
  createEmptyGraph,
  degree,
  deleteSong,
  deleteTransition,
  findDuplicateSong,
  groupByNeighbor,
  incoming,
  outgoing,
  searchSongs,
  stats,
  transitionsBetween,
  updateSong,
  updateTransition,
  validateTransitionInput,
} from './graph';
import type { GraphData } from './types';

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

/** A → B (two variants), B → C, C → A */
function fixture(): GraphData {
  let g = createEmptyGraph();
  g = addSong(g, { title: 'Alpha', artist: 'DJ One', bpm: 124 }, { id: 'a', now: NOW }).graph;
  g = addSong(g, { title: 'Bravo', artist: 'Two', bpm: 126, key: '8A', tags: ['house'] }, { id: 'b', now: NOW }).graph;
  g = addSong(g, { title: 'Charlie', bpm: 122 }, { id: 'c', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromTime: 300, toTime: 30, fromBpm: 125, toBpm: 125, rating: 4 }, { id: 'ab1', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromTime: 180, toTime: 0, fromBpm: 124, toBpm: 124, rating: 5 }, { id: 'ab2', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'b', toSongId: 'c', fromTime: 240, toTime: 16 }, { id: 'bc', now: NOW }).graph;
  g = addTransition(g, { fromSongId: 'c', toSongId: 'a', rating: 1 }, { id: 'ca', now: NOW }).graph;
  return g;
}

describe('songs', () => {
  it('adds a song with trimmed fields and defaults', () => {
    const { graph, song } = addSong(createEmptyGraph(), { title: '  Alpha ', tags: ['house', ' House', 'deep', ''] }, { id: 'x', now: NOW });
    expect(song).toEqual({
      id: 'x', title: 'Alpha', artist: '', bpm: null, key: '', tags: ['house', 'deep'], notes: '', createdAt: NOW, updatedAt: NOW,
    });
    expect(graph.songs.x).toBe(song);
  });

  it('does not mutate the input graph', () => {
    const g = createEmptyGraph();
    addSong(g, { title: 'Alpha' });
    expect(Object.keys(g.songs)).toHaveLength(0);
  });

  it('rejects songs without a title or with an absurd BPM', () => {
    expect(() => addSong(createEmptyGraph(), { title: '  ' })).toThrow(GraphError);
    expect(() => addSong(createEmptyGraph(), { title: 'x', bpm: 5 })).toThrow(/BPM/);
    expect(() => addSong(createEmptyGraph(), { title: 'x', bpm: Number.NaN })).toThrow(/number/);
  });

  it('updates a song and bumps updatedAt', () => {
    const g = updateSong(fixture(), 'a', { bpm: 123, artist: 'DJ Uno' }, LATER);
    expect(g.songs.a).toMatchObject({ title: 'Alpha', artist: 'DJ Uno', bpm: 123, createdAt: NOW, updatedAt: LATER });
  });

  it('can clear the BPM by setting it to null', () => {
    expect(updateSong(fixture(), 'a', { bpm: null }).songs.a!.bpm).toBeNull();
  });

  it('deletes a song together with all its transitions', () => {
    const g = deleteSong(fixture(), 'b');
    expect(g.songs.b).toBeUndefined();
    expect(Object.keys(g.transitions).sort()).toEqual(['ca']);
  });

  it('throws when updating or deleting a missing song', () => {
    expect(() => updateSong(fixture(), 'zzz', { title: 'x' })).toThrow(GraphError);
    expect(() => deleteSong(fixture(), 'zzz')).toThrow(GraphError);
  });
});

describe('transitions', () => {
  it('allows several transitions between the same two songs (multigraph)', () => {
    const between = transitionsBetween(fixture(), 'a', 'b');
    expect(between.map((t) => t.id)).toEqual(['ab2', 'ab1']); // sorted by mix-out point
  });

  it('is directed: A → B is not B → A', () => {
    expect(transitionsBetween(fixture(), 'b', 'a')).toEqual([]);
  });

  it('requires both songs to exist', () => {
    const g = fixture();
    expect(() => addTransition(g, { fromSongId: 'a', toSongId: 'nope' })).toThrow(/mix in/);
    expect(validateTransitionInput(g, { fromSongId: 'nope', toSongId: 'a' })).toHaveProperty('fromSongId');
  });

  it('validates bars, times, BPMs and ratings', () => {
    const g = fixture();
    const errors = validateTransitionInput(g, {
      fromSongId: 'a', toSongId: 'b', fromBar: 0, toBar: 2.5, fromTime: -1, toBpm: 900, rating: 7, overlapBars: 0,
    });
    expect(Object.keys(errors).sort()).toEqual(['fromBar', 'fromTime', 'overlapBars', 'rating', 'toBar', 'toBpm']);
  });

  it('stores and edits the overlap length', () => {
    let g = addTransition(fixture(), { fromSongId: 'a', toSongId: 'c', fromBar: 97, overlapBars: 16 }, { id: 'ac', now: NOW }).graph;
    expect(g.transitions.ac!.overlapBars).toBe(16);
    g = updateTransition(g, 'ac', { overlapBars: 32 });
    expect(g.transitions.ac!.overlapBars).toBe(32);
    expect(updateTransition(g, 'ac', { overlapBars: null }).transitions.ac!.overlapBars).toBeNull();
    expect(g.transitions.ab1!.overlapBars).toBeNull();
  });

  it('stores bars and sorts variants by mix-out bar first', () => {
    let g = fixture();
    g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromBar: 33, toBar: 1 }, { id: 'ab3', now: NOW }).graph;
    expect(g.transitions.ab3).toMatchObject({ fromBar: 33, toBar: 1, fromTime: null });
    expect(transitionsBetween(g, 'a', 'b').map((t) => t.id)).toEqual(['ab3', 'ab2', 'ab1']);
  });

  it('updates a transition, including re-pointing it', () => {
    const g = updateTransition(fixture(), 'bc', { toSongId: 'a', rating: 3, fromBpm: 126 }, LATER);
    expect(g.transitions.bc).toMatchObject({ fromSongId: 'b', toSongId: 'a', rating: 3, fromBpm: 126, fromTime: 240, updatedAt: LATER });
  });

  it('can clear optional fields by setting them to null', () => {
    const g = updateTransition(fixture(), 'ab1', { rating: null, fromTime: null });
    expect(g.transitions.ab1).toMatchObject({ rating: null, fromTime: null, toTime: 30 });
  });

  it('deletes a transition and leaves the songs', () => {
    const g = deleteTransition(fixture(), 'ab1');
    expect(g.transitions.ab1).toBeUndefined();
    expect(Object.keys(g.songs)).toHaveLength(3);
  });
});

describe('queries', () => {
  it('lists outgoing and incoming edges', () => {
    const g = fixture();
    expect(outgoing(g, 'a').map((t) => t.id)).toEqual(['ab2', 'ab1']);
    expect(incoming(g, 'a').map((t) => t.id)).toEqual(['ca']);
    expect(degree(g, 'a')).toEqual({ out: 2, in: 1 });
    expect(degree(g, 'b')).toEqual({ out: 1, in: 2 });
  });

  it('groups edges by neighbour song', () => {
    const g = fixture();
    const groups = groupByNeighbor(g, outgoing(g, 'a'), 'to');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.song.id).toBe('b');
    expect(groups[0]!.transitions).toHaveLength(2);
    const incomingGroups = groupByNeighbor(g, incoming(g, 'b'), 'from');
    expect(incomingGroups.map((x) => x.song.id)).toEqual(['a']);
  });

  it('searches title, artist, key and tags, ignoring case and accents', () => {
    let g = fixture();
    g = addSong(g, { title: 'Café del Mar', artist: 'Energy 52' }, { id: 'cafe' }).graph;
    expect(searchSongs(g, 'cafe').map((s) => s.id)).toEqual(['cafe']);
    expect(searchSongs(g, 'HOUSE').map((s) => s.id)).toEqual(['b']);
    expect(searchSongs(g, '8a two').map((s) => s.id)).toEqual(['b']);
    expect(searchSongs(g, '').map((s) => s.id)).toEqual(['a', 'b', 'cafe', 'c']);
  });

  it('detects duplicates by title + artist', () => {
    const g = fixture();
    expect(findDuplicateSong(g, ' alpha ', 'dj  one')?.id).toBe('a');
    expect(findDuplicateSong(g, 'Alpha', 'Someone else')).toBeUndefined();
    expect(findDuplicateSong(g, 'Alpha', 'DJ One', 'a')).toBeUndefined();
  });

  it('counts songs, transitions and connected pairs', () => {
    expect(stats(fixture())).toEqual({ songs: 3, transitions: 4, pairs: 3, sets: 0 });
  });
});

describe('ideas (pairs that go well together, transition not found yet)', () => {
  it('saves an idea with no mix points, and leaves the flag off worked-out transitions', () => {
    const r = addTransition(fixture(), { fromSongId: 'b', toSongId: 'a', idea: true }, { id: 'ba', now: NOW });
    expect(r.transition).toMatchObject({ idea: true, fromBar: null, toBar: null, rating: null });
    expect('idea' in r.graph.transitions['ab1']!).toBe(false);
  });

  it('keeps the flag through edits and drops it once the mix is worked out', () => {
    let g = addTransition(fixture(), { fromSongId: 'b', toSongId: 'a', idea: true }, { id: 'ba', now: NOW }).graph;
    g = updateTransition(g, 'ba', { notes: 'try the breakdown' }, LATER);
    expect(g.transitions['ba']!.idea).toBe(true);
    g = updateTransition(g, 'ba', { idea: false, fromBar: 97, toBar: 1 }, LATER);
    expect('idea' in g.transitions['ba']!).toBe(false);
    expect(g.transitions['ba']!.fromBar).toBe(97);
  });
});
