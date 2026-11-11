import { describe, expect, it } from 'vitest';
import { addSong, addTransition, createEmptyGraph, deleteSong, updateSong } from './graph';
import { appendTransition, createSet } from './sets';
import { applyPulled, baseOf, fingerprint, planSync, removeRecords } from './shopSync';
import type { GraphData } from './types';

const T0 = '2026-01-01T00:00:00.000Z';
const SYNC = '2026-01-02T00:00:00.000Z';
const LATER = '2026-01-03T00:00:00.000Z';

/** A, B, C with A → B and a set A → B. */
function crate(): GraphData {
  let g = createEmptyGraph();
  for (const id of ['a', 'b', 'c']) g = addSong(g, { title: id.toUpperCase() }, { id, now: T0 }).graph;
  g = addTransition(g, { fromSongId: 'a', toSongId: 'b', fromBar: 97 }, { id: 'ab', now: T0 }).graph;
  g = createSet(g, { name: 'S', startSongId: 'a' }, { id: 's', now: T0 }).graph;
  g = appendTransition(g, 's', 'ab', T0);
  return g;
}

describe('planSync', () => {
  it('without a base it is the plain merge: both sides’ records end up in both', () => {
    const local = addSong(crate(), { title: 'Mine' }, { id: 'm', now: LATER }).graph;
    const remote = addSong(crate(), { title: 'Theirs' }, { id: 't', now: LATER }).graph;
    const plan = planSync(local, remote, null);
    expect(Object.keys(plan.upload.songs).sort()).toEqual(['a', 'b', 'c', 'm', 't']);
    expect(Object.keys(plan.pulled.songs)).toEqual(['t']);
    expect(plan.unchanged).toBe(false);
    expect(plan.counts).toEqual({ pulled: 1, deletedThere: 0, deletedHere: 0 });
  });

  it('a crate that isn’t in the shop yet is uploaded as it is', () => {
    const plan = planSync(crate(), null, null);
    expect(plan.upload).toEqual(crate());
    expect(plan.counts.pulled).toBe(0);
  });

  it('is unchanged when the shop copy already matches', () => {
    expect(planSync(crate(), crate(), baseOf(crate(), SYNC)).unchanged).toBe(true);
  });

  it('a song deleted on this device is not brought back, and leaves the shop copy too', () => {
    const base = baseOf(crate(), SYNC);
    const local = deleteSong(crate(), 'c', LATER);
    const plan = planSync(local, crate(), base);
    expect(plan.upload.songs['c']).toBeUndefined();
    expect(plan.pulled.songs['c']).toBeUndefined();
    expect(plan.deletedHere.songs).toEqual(['c']);
  });

  it('a deletion takes the song’s transitions and set steps with it', () => {
    const base = baseOf(crate(), SYNC);
    const local = deleteSong(crate(), 'b', LATER);
    const plan = planSync(local, crate(), base);
    expect(plan.upload.transitions['ab']).toBeUndefined();
    expect(plan.upload.sets['s']!.songIds).toEqual(['a']);
  });

  it('a song deleted on another device is removed here, unless it was edited here since', () => {
    const base = baseOf(crate(), SYNC);
    const remote = deleteSong(crate(), 'c', LATER);
    const plan = planSync(crate(), remote, base);
    expect(plan.deletedThere.songs).toEqual(['c']);
    expect(plan.upload.songs['c']).toBeUndefined();
    expect(applyPulled(crate(), plan, base).songs['c']).toBeUndefined();

    const edited = updateSong(crate(), 'c', { title: 'C, now with notes' }, LATER);
    const plan2 = planSync(edited, remote, base);
    expect(plan2.deletedThere.songs).toEqual([]);
    expect(plan2.upload.songs['c']!.title).toBe('C, now with notes');
  });

  it('new songs from another device come in even though they are not in the base', () => {
    const base = baseOf(crate(), SYNC);
    const remote = addSong(crate(), { title: 'New on laptop' }, { id: 'n', now: T0 }).graph; // an older timestamp, synced late
    const plan = planSync(crate(), remote, base);
    expect(plan.pulled.songs['n']).toBeDefined();
    expect(applyPulled(crate(), plan, base).songs['n']!.title).toBe('New on laptop');
  });

  it('newer edits win either way', () => {
    const base = baseOf(crate(), SYNC);
    const local = updateSong(crate(), 'a', { title: 'A (mine)' }, LATER);
    const remote = updateSong(crate(), 'b', { title: 'B (theirs)' }, LATER);
    const plan = planSync(local, remote, base);
    expect(plan.upload.songs['a']!.title).toBe('A (mine)');
    expect(plan.upload.songs['b']!.title).toBe('B (theirs)');
    expect(Object.keys(plan.pulled.songs)).toEqual(['b']);
  });

  it('flags a sync that would delete a large part of the crate', () => {
    let big = crate();
    for (let i = 0; i < 20; i++) big = addSong(big, { title: `S${i}` }, { id: `s${i}`, now: T0 }).graph;
    const base = baseOf(big, SYNC);
    let local = big;
    for (let i = 0; i < 12; i++) local = deleteSong(local, `s${i}`, LATER);
    expect(planSync(local, big, base).risky).toBe(true);
    expect(planSync(deleteSong(big, 's0', LATER), big, base).risky).toBe(false);
  });
});

describe('applyPulled', () => {
  it('keeps what was entered while the sync was on its way', () => {
    const base = baseOf(crate(), SYNC);
    const remote = addSong(crate(), { title: 'From laptop' }, { id: 'n', now: LATER }).graph;
    const plan = planSync(crate(), remote, base);
    // Meanwhile, on the phone: a new song and an edit.
    let now = addSong(crate(), { title: 'Just heard this' }, { id: 'j', now: LATER }).graph;
    now = updateSong(now, 'a', { title: 'A, renamed' }, LATER);
    const after = applyPulled(now, plan, base);
    expect(after.songs['j']!.title).toBe('Just heard this');
    expect(after.songs['a']!.title).toBe('A, renamed');
    expect(after.songs['n']!.title).toBe('From laptop');
  });

  it('changes nothing (same object) when there is nothing to bring in', () => {
    const g = crate();
    expect(applyPulled(g, planSync(g, crate(), baseOf(g, SYNC)), baseOf(g, SYNC))).toBe(g);
  });

  it('drops a pulled transition whose song was deleted meanwhile', () => {
    const base = baseOf(crate(), SYNC);
    const remote = addTransition(crate(), { fromSongId: 'b', toSongId: 'c' }, { id: 'bc', now: LATER }).graph;
    const plan = planSync(crate(), remote, base);
    const now = deleteSong(crate(), 'c', LATER);
    expect(applyPulled(now, plan, base).transitions['bc']).toBeUndefined();
  });
});

describe('removeRecords', () => {
  it('does not make the touched sets look newly edited', () => {
    const g = removeRecords(crate(), { songs: ['b'], transitions: [], sets: [] });
    expect(g.sets['s']!.songIds).toEqual(['a']);
    expect(g.sets['s']!.updatedAt).toBe(crate().sets['s']!.updatedAt);
  });
});

describe('fingerprint', () => {
  it('ignores order and spots changes', () => {
    const g = crate();
    const reordered: GraphData = { ...g, songs: Object.fromEntries(Object.entries(g.songs).reverse()) };
    expect(fingerprint(reordered)).toBe(fingerprint(g));
    expect(fingerprint(updateSong(g, 'a', { energy: 50 }, T0))).not.toBe(fingerprint(g));
  });
});
