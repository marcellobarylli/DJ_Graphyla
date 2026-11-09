import { describe, expect, it } from 'vitest';
import figures from '../assets/y2k/figures.json';
import { type FigureAnchors, STRIKE_KINDS, jag, seeded, strike, toPath } from './lightning';

describe('jag', () => {
  it('runs from a to b in 2^depth segments', () => {
    const pts = jag([0, 0], [100, 200], seeded(1), 0.3, 5);
    expect(pts).toHaveLength(33);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)).toEqual([100, 200]);
  });

  it('stays near the straight line', () => {
    const pts = jag([0, 0], [0, 100], seeded(2), 0.28, 6);
    for (const [x] of pts) expect(Math.abs(x)).toBeLessThan(100);
  });
});

describe('strike', () => {
  const man = figures.man as unknown as FigureAnchors;

  it('gives a path and branches for every kind', () => {
    for (const kind of STRIKE_KINDS) {
      const s = strike(man, kind, seeded(3));
      expect(s.main).toMatch(/^M[-\d.]+ [-\d.]+(L[-\d.]+ [-\d.]+)+$/);
      expect(s.branches.length).toBeGreaterThan(0);
    }
  });

  it('lands sky strikes on the headphones and starts hand strikes at a hand', () => {
    const sky = strike(man, 'sky', seeded(4)).main;
    expect(sky.endsWith(`L${man.crown[0].toFixed(1)} ${man.crown[1].toFixed(1)}`)).toBe(true);
    const hands = strike(man, 'hands', seeded(5)).main;
    const starts = [man.handL, man.handR].map((p) => toPath([p]));
    expect(starts.some((m) => hands.startsWith(m))).toBe(true);
  });

  it('is repeatable with the same seed', () => {
    expect(strike(man, 'cross', seeded(9))).toEqual(strike(man, 'cross', seeded(9)));
  });
});
