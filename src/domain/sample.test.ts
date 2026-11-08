import { describe, expect, it } from 'vitest';
import { stats, transitionsBetween } from './graph';
import { SAMPLE_CRATE_NAME, buildSampleGraph, sampleCrateName } from './sample';
import { exportJson, parseBackup } from './serialize';
import { walkOf } from './sets';

const NOW = '2026-01-01T00:00:00.000Z';

describe('sample crate', () => {
  it('has songs, transitions and two sets', () => {
    expect(stats(buildSampleGraph(NOW))).toEqual({ songs: 10, transitions: 14, pairs: 13, sets: 2 });
  });

  it('shows the interesting cases: variants, a failed mix, an unrated mix, a gap', () => {
    const g = buildSampleGraph(NOW);
    const byTitle = (t: string) => Object.values(g.songs).find((s) => s.title === t)!.id;
    expect(transitionsBetween(g, byTitle('Neon Tide'), byTitle('Velvet Static'))).toHaveLength(2);
    const ts = Object.values(g.transitions);
    expect(ts.some((t) => t.rating === 1)).toBe(true);
    expect(ts.some((t) => t.rating === null)).toBe(true);
    const walks = Object.values(g.sets).map((s) => walkOf(g, s));
    expect(walks.map((w) => w.gaps).sort()).toEqual([0, 1]);
  });

  it('builds the warmup set as a real walk with a rising tempo', () => {
    const g = buildSampleGraph(NOW);
    const set = Object.values(g.sets).find((s) => s.name.includes('warmup'))!;
    expect(set.songIds).toHaveLength(9);
    set.transitionIds.forEach((tid, i) => {
      const t = g.transitions[tid!]!;
      expect([t.fromSongId, t.toSongId]).toEqual([set.songIds[i], set.songIds[i + 1]]);
    });
    const walk = walkOf(g, set);
    expect(walk.startBpm).toBe(122);
    expect(walk.steps[walk.steps.length - 1]!.enterBpm).toBe(127);
  });

  it('creates fresh ids every time and survives a backup round trip', () => {
    const a = buildSampleGraph(NOW);
    const b = buildSampleGraph(NOW);
    expect(Object.keys(a.songs).some((id) => b.songs[id])).toBe(false);
    expect(parseBackup(exportJson(a, NOW))).toEqual(a);
  });

  it('picks a free name', () => {
    expect(sampleCrateName(['My crate'])).toBe(SAMPLE_CRATE_NAME);
    expect(sampleCrateName([SAMPLE_CRATE_NAME, `${SAMPLE_CRATE_NAME} 2`])).toBe(`${SAMPLE_CRATE_NAME} 3`);
  });
});
