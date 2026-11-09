import { describe, expect, it } from 'vitest';
import {
  aliasesFrom,
  collapseSongs,
  editDistance,
  findDuplicateGroups,
  findSimilarSong,
  looksLikeSameSong,
  normalizeName,
  pairKey,
  similarNames,
  suggestedKeeper,
} from './dedupe';
import { addSong, addTransition, createEmptyGraph } from './graph';
import { parseBackup, exportJson, mergeGraphs } from './serialize';
import { appendGap, appendTransition, createSet } from './sets';
import type { GraphData, SongInput } from './types';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-05T10:00:00.000Z';
const NOW = '2026-11-09T12:00:00.000Z';

function songs(...inputs: [id: string, input: SongInput, at?: string][]): GraphData {
  let g = createEmptyGraph();
  for (const [id, input, at] of inputs) g = addSong(g, input, { id, now: at ?? T0 }).graph;
  return g;
}

describe('similarNames', () => {
  it.each([
    ['Neon Tide', 'neon tide'],
    ['Neon Tide', '  Neon   Tide '],
    ['Neon Tide', 'NeonTide'],
    ['Café del Mar', 'Cafe Del Mar'],
    ['Sola & Kemp', 'Sola and Kemp'],
    ['Sola & Kemp', 'Kemp & Sola'],
    ['Afterburner Drive', 'Afterburner Driev'],
    ['Afterburner Drive', 'Aftreburner Drive'],
    ['Paper Satellites', 'Paper Satelites'],
    ['Signal Lost!', 'Signal Lost'],
  ])('“%s” ≈ “%s”', (a, b) => {
    expect(similarNames(a, b)).toBe(true);
  });

  it.each([
    ['Part 1', 'Part 2'],
    ['Vol. 3', 'Vol. 4'],
    ['Neon Tide', 'Neon Tide (Dub)'],
    ['Neon Tide (Extended Mix)', 'Neon Tide (Radio Edit)'],
    ['Glasshouse', 'Greenhouse'],
    ['Intro', 'Outro'],
    ['Hold', 'Gold'],
    ['', ''],
  ])('“%s” ≠ “%s”', (a, b) => {
    expect(similarNames(a, b)).toBe(false);
  });

  it('normalises case, accents, punctuation and “&”', () => {
    expect(normalizeName('  Beyoncé — Halo (feat. X) & Co!! ')).toBe('beyonce halo feat x and co');
  });

  it('counts swapped letters as one typo', () => {
    expect(editDistance('drive', 'dirve')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });
});

describe('looksLikeSameSong', () => {
  it('needs similar artists too, unless one is missing', () => {
    expect(looksLikeSameSong({ title: 'Neon Tide', artist: 'Kaia Lumen' }, { title: 'neon tide', artist: 'kaia lumen' })).toBe(true);
    expect(looksLikeSameSong({ title: 'Neon Tide', artist: 'Kaia Lumen' }, { title: 'Neon Tide', artist: '' })).toBe(true);
    expect(looksLikeSameSong({ title: 'Neon Tide', artist: 'Kaia Lumen' }, { title: 'Neon Tide', artist: 'Ventura Haze' })).toBe(false);
  });
});

describe('findDuplicateGroups', () => {
  const g = songs(
    ['a', { title: 'Neon Tide', artist: 'Kaia Lumen' }],
    ['b', { title: 'neon  tide', artist: 'Kaia lumen' }, T1],
    ['c', { title: 'Neon Tdie', artist: '' }, NOW],
    ['d', { title: 'Glasshouse', artist: 'Oren Vale' }],
    ['e', { title: 'Glass House', artist: 'Oren Vale' }],
    ['f', { title: 'Copper Moon', artist: 'Duskwalker' }],
  );

  it('groups look-alikes transitively, like collapsing repeats', () => {
    expect(findDuplicateGroups(g)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('limits to groups that contain new songs', () => {
    expect(findDuplicateGroups(g, { among: ['e'] })).toEqual([['d', 'e']]);
    expect(findDuplicateGroups(g, { among: ['f'] })).toEqual([]);
  });

  it('respects “not the same” decisions', () => {
    expect(findDuplicateGroups(g, { dismissed: new Set([pairKey('e', 'd')]) })).toEqual([['a', 'b', 'c']]);
  });

  it('suggests a “did you mean” while typing a new song', () => {
    expect(findSimilarSong(g, 'Coper Moon', 'duskwalker')?.id).toBe('f');
    expect(findSimilarSong(g, 'Copper Moon', 'Duskwalker', 'f')).toBeUndefined();
  });
});

describe('collapseSongs', () => {
  // a = "Neon Tide" (kept), b = typo duplicate; x, y = other songs.
  function setup() {
    let g = songs(
      ['a', { title: 'Neon Tide', artist: 'Kaia Lumen', bpm: null, tags: ['deep'] }],
      ['b', { title: 'Neon Tdie', artist: 'kaia lumen', bpm: 122, key: '8A', tags: ['Deep', 'warmup'], notes: 'from Kat' }, T1],
      ['x', { title: 'Velvet Static' }],
      ['y', { title: 'Glasshouse' }],
    );
    const add = (id: string, from: string, to: string, fromBar: number | null, at = T0) => {
      g = addTransition(g, { fromSongId: from, toSongId: to, fromBar, toBar: 1 }, { id, now: at }).graph;
    };
    add('t-xa', 'x', 'a', 97);
    add('t-xb', 'x', 'b', 97, T1); // same mix as t-xa once b is a → folded
    add('t-xb2', 'x', 'b', 129); // a different variant → kept
    add('t-by', 'b', 'y', 64);
    add('t-ab', 'a', 'b', 33); // a song into its own duplicate → dropped
    g = createSet(g, { name: 'Walk', startSongId: 'x' }, { id: 'set', now: T0 }).graph;
    g = appendTransition(g, 'set', 't-xb', T0);
    g = appendTransition(g, 'set', 't-by', T0);
    g = createSet(g, { name: 'Twice', startSongId: 'a' }, { id: 'set2', now: T0 }).graph;
    g = appendTransition(g, 'set2', 't-ab', T0);
    g = appendGap(g, 'set2', 'y', T0);
    return g;
  }

  it('keeps one song, fills its gaps and remembers the folded id', () => {
    const g = collapseSongs(setup(), 'a', ['b'], NOW);
    expect(g.songs.b).toBeUndefined();
    expect(g.songs.a).toMatchObject({ title: 'Neon Tide', artist: 'Kaia Lumen', bpm: 122, key: '8A', tags: ['deep', 'warmup'], notes: 'from Kat', mergedIds: ['b'], updatedAt: NOW });
  });

  it('moves transitions over, folds identical mixes and drops self-mixes', () => {
    const g = collapseSongs(setup(), 'a', ['b'], NOW);
    const ts = Object.values(g.transitions).map((t) => `${t.id}:${t.fromSongId}>${t.toSongId}@${t.fromBar}`).sort();
    expect(ts).toEqual(['t-by:a>y@64', 't-xb2:x>a@129', 't-xb:x>a@97']);
  });

  it('keeps sets walking through the kept song', () => {
    const g = collapseSongs(setup(), 'a', ['b'], NOW);
    expect(g.sets.set).toMatchObject({ songIds: ['x', 'a', 'y'], transitionIds: ['t-xb', 't-by'] });
    // a → (its duplicate) → y: the duplicate step collapses, a is played once.
    expect(g.sets.set2).toMatchObject({ songIds: ['a', 'y'], transitionIds: [null] });
  });

  it('survives a save and load', () => {
    const g = collapseSongs(setup(), 'a', ['b'], NOW);
    expect(parseBackup(exportJson(g)).songs.a!.mergedIds).toEqual(['b']);
  });

  it('suggests keeping the best connected song', () => {
    expect(suggestedKeeper(setup(), ['a', 'b'])).toBe('b');
  });
});

describe('merges keep collapsed duplicates collapsed', () => {
  const shop = songs(['a', { title: 'Neon Tide', artist: 'Kaia Lumen' }], ['b', { title: 'Neon Tdie', artist: 'Kaia Lumen' }], ['y', { title: 'Glasshouse' }]);
  const shopWithMix = addTransition(shop, { fromSongId: 'b', toSongId: 'y', fromBar: 64 }, { id: 't-by', now: T0 }).graph;
  const mine = collapseSongs(shopWithMix, 'a', ['b'], NOW);

  it('folds the old duplicate in when the other side still has it', () => {
    const r = mergeGraphs(mine, shopWithMix);
    expect(Object.keys(r.graph.songs).sort()).toEqual(['a', 'y']);
    expect(r.graph.transitions['t-by']).toMatchObject({ fromSongId: 'a', toSongId: 'y' });
    expect(r.addedSongIds).toEqual([]);
  });

  it('works the other way round too (the shop gets my collapse)', () => {
    const r = mergeGraphs(shopWithMix, mine);
    expect(Object.keys(r.graph.songs).sort()).toEqual(['a', 'y']);
    expect(r.graph.songs.a!.mergedIds).toEqual(['b']);
  });

  it('keeps the collapse even if the other side edited the kept song later', () => {
    const editedLater = { ...shopWithMix, songs: { ...shopWithMix.songs, a: { ...shopWithMix.songs.a!, notes: 'later', updatedAt: '2026-12-01T00:00:00.000Z' } } };
    const r = mergeGraphs(mine, editedLater);
    expect(r.graph.songs.a).toMatchObject({ notes: 'later', mergedIds: ['b'] });
    expect(r.graph.songs.b).toBeUndefined();
  });

  it('reports which songs came in new', () => {
    const extra = addSong(shop, { title: 'Copper Moon' }, { id: 'new', now: T0 }).graph;
    expect(mergeGraphs(mine, extra).addedSongIds).toEqual(['new']);
  });

  it('resolves chains of collapses', () => {
    const g = songs(['c', { title: 'C' }]);
    const withChain = { ...g, songs: { c: { ...g.songs.c!, mergedIds: ['b'] }, b: { ...g.songs.c!, id: 'b', mergedIds: ['a'] } } };
    expect([...aliasesFrom([withChain])]).toEqual([
      ['b', 'c'],
      ['a', 'c'],
    ]);
  });
});
