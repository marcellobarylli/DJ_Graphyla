import { describe, expect, it } from 'vitest';
import { addSong, addTransition, createEmptyGraph } from './graph';
import {
  advance,
  currentStep,
  freePlan,
  GET_READY_BARS,
  getReadyBar,
  jumpTo,
  leftThePlan,
  otherOptions,
  plannedNext,
  restoreLive,
  saveLiveAsSet,
  startFreeWalk,
  startLive,
  stepBack,
} from './live';
import { appendGap, appendTransition, createSet, walkOf } from './sets';
import type { GraphData } from './types';

const NOW = '2026-01-01T00:00:00.000Z';

/**
 * Set: a →ab b →bc c →(gap) d
 * Extra edges: b →bd d (rating 5), a →ac c (rating 2), d →da a
 */
function fixture(): GraphData {
  let g = createEmptyGraph();
  for (const id of ['a', 'b', 'c', 'd']) g = addSong(g, { title: id.toUpperCase(), bpm: 124 }, { id, now: NOW }).graph;
  const edges: [string, string, string, number | null][] = [
    ['ab', 'a', 'b', 4],
    ['bc', 'b', 'c', 3],
    ['bd', 'b', 'd', 5],
    ['ac', 'a', 'c', 2],
    ['da', 'd', 'a', null],
  ];
  for (const [id, from, to, rating] of edges) {
    g = addTransition(g, { fromSongId: from, toSongId: to, fromBar: 97, toBar: 1, fromBpm: 124, toBpm: 124, rating }, { id, now: NOW }).graph;
  }
  g = createSet(g, { name: 'Plan', startSongId: 'a' }, { id: 's', now: NOW }).graph;
  g = appendTransition(g, 's', 'ab', NOW);
  g = appendTransition(g, 's', 'bc', NOW);
  g = appendGap(g, 's', 'd', NOW);
  return g;
}

describe('play mode', () => {
  it('starts at the first song of the set', () => {
    const g = fixture();
    const s = startLive(g.sets.s!);
    expect(currentStep(s)).toEqual({ songId: 'a', viaTransitionId: null, planIndex: 0 });
    expect(() => startLive({ ...g.sets.s!, songIds: [] })).toThrow(/no songs/);
  });

  it('follows the plan step by step, including gaps', () => {
    const g = fixture();
    const set = g.sets.s!;
    let s = startLive(set);
    expect(plannedNext(g, set, s)).toMatchObject({ toSongId: 'b', planned: true, rejoinsAt: 1, transition: { id: 'ab' } });
    s = advance(s, plannedNext(g, set, s)!);
    s = advance(s, plannedNext(g, set, s)!);
    expect(plannedNext(g, set, s)).toMatchObject({ toSongId: 'd', transition: null });
    s = advance(s, plannedNext(g, set, s)!);
    expect(plannedNext(g, set, s)).toBeNull();
    expect(leftThePlan(set, s)).toBe(false);
  });

  it('offers the other ways out, best rated first, marking rejoins', () => {
    const g = fixture();
    const set = g.sets.s!;
    let s = startLive(set);
    expect(otherOptions(g, set, s).map((o) => [o.transition!.id, o.rejoinsAt])).toEqual([['ac', 2]]);
    s = advance(s, plannedNext(g, set, s)!); // at b
    expect(otherOptions(g, set, s).map((o) => [o.transition!.id, o.rejoinsAt])).toEqual([['bd', 3]]);
  });

  it('walks off the plan and back onto it', () => {
    const g = fixture();
    const set = g.sets.s!;
    let s = startLive(set);
    s = advance(s, plannedNext(g, set, s)!); // b
    s = advance(s, otherOptions(g, set, s)[0]!); // b →bd d: rejoins at step 3
    expect(currentStep(s)).toEqual({ songId: 'd', viaTransitionId: 'bd', planIndex: 3 });
    expect(plannedNext(g, set, s)).toBeNull(); // d is the last song of the set
    const fromD = otherOptions(g, set, s);
    expect(fromD.map((o) => [o.transition!.id, o.rejoinsAt])).toEqual([['da', null]]); // a is behind us
    s = advance(s, fromD[0]!);
    expect(currentStep(s).planIndex).toBeNull();
    expect(plannedNext(g, set, s)).toBeNull();
    expect(leftThePlan(set, s)).toBe(true);
  });

  it('steps back, but never before the first song', () => {
    const g = fixture();
    let s = startLive(g.sets.s!);
    expect(stepBack(s)).toBe(s);
    s = advance(s, plannedNext(g, g.sets.s!, s)!);
    expect(currentStep(stepBack(s)).songId).toBe('a');
  });

  it('refuses a transition that does not start at the current song', () => {
    const g = fixture();
    const s = startLive(g.sets.s!);
    expect(() => advance(s, { toSongId: 'd', transition: g.transitions.bd!, planned: false, rejoinsAt: null })).toThrow(/current song/);
  });

  it('saves what was played as a new set', () => {
    const g = fixture();
    const set = g.sets.s!;
    let s = startLive(set);
    s = advance(s, plannedNext(g, set, s)!);
    s = advance(s, otherOptions(g, set, s)[0]!);
    s = advance(s, otherOptions(g, set, s)[0]!);
    const { graph, set: played } = saveLiveAsSet(g, s, 'Played');
    expect(played).toMatchObject({ name: 'Played', songIds: ['a', 'b', 'd', 'a'], transitionIds: ['ab', 'bd', 'da'] });
    expect(walkOf(graph, played).gaps).toBe(0);
    expect(graph.sets.s).toEqual(set);
  });

  it('restores a saved session only if it still fits', () => {
    const g = fixture();
    const set = g.sets.s!;
    const s = advance(startLive(set), plannedNext(g, set, startLive(set))!);
    expect(restoreLive(g, set, JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreLive(g, set, { ...s, setId: 'other' })).toBeNull();
    expect(restoreLive(g, set, { ...s, steps: [{ songId: 'gone', viaTransitionId: null, planIndex: null }] })).toBeNull();
    expect(restoreLive(g, set, null)).toBeNull();
  });
});

describe('getting ready', () => {
  it('is one phrase (16 bars) before the mix-out', () => {
    expect(GET_READY_BARS).toBe(16);
    expect(getReadyBar(97)).toBe(81);
    expect(getReadyBar(17)).toBe(1);
  });

  it('is bar 1 when the mix-out comes in the first phrase, and absent without a mix-out bar', () => {
    expect(getReadyBar(9)).toBe(1);
    expect(getReadyBar(1)).toBe(1);
    expect(getReadyBar(null)).toBeNull();
  });
});

describe('free walk (no set)', () => {
  it('starts at any song and offers every way out, best rated first', () => {
    const g = fixture();
    const plan = freePlan('free:c1');
    const s = startFreeWalk(plan, 'b');
    expect(currentStep(s)).toEqual({ songId: 'b', viaTransitionId: null, planIndex: null });
    expect(plannedNext(g, plan, s)).toBeNull();
    expect(otherOptions(g, plan, s).map((o) => [o.transition!.id, o.rejoinsAt])).toEqual([
      ['bd', null],
      ['bc', null],
    ]);
  });

  it('walks, jumps, steps back, saves and restores', () => {
    const g = fixture();
    const plan = freePlan('free:c1');
    let s = startFreeWalk(plan, 'a');
    s = advance(s, otherOptions(g, plan, s)[0]!); // a →ab b (rating 4 beats ac's 2)
    s = advance(s, jumpTo('c')); // no transition: a gap
    expect(s.steps.map((x) => [x.songId, x.viaTransitionId])).toEqual([
      ['a', null],
      ['b', 'ab'],
      ['c', null],
    ]);
    expect(restoreLive(g, plan, JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreLive(g, freePlan('free:other'), s)).toBeNull();
    const { set } = saveLiveAsSet(g, s, 'Free walk');
    expect(set).toMatchObject({ songIds: ['a', 'b', 'c'], transitionIds: ['ab', null] });
    expect(currentStep(stepBack(s)).songId).toBe('b');
  });
});
